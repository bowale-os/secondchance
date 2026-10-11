"""Phase 3 backend: a client's kept papers, open to-dos, checking off and removing."""

import pytest
from sqlalchemy import update

from app.tables import Assignment

from tests.test_reader_keep import PAGE_1, PAGE_2, count_rows, env, pages, process  # noqa: F401  (env is a fixture)


async def keep_one(env, *datas, data=None):
    data = data or {}
    token = (await process(env, *datas, data=data))[-1]["receipt"]
    r = await env["http"].post("/reader/keep", files=pages(*datas), data={**data, "receipt": token})
    assert r.status_code == 201, r.text
    return r.json()["readingId"]


@pytest.mark.asyncio
async def test_list_and_search_kept_papers(env):
    rid = await keep_one(env, PAGE_1)
    r = await env["http"].get("/auth/client/papers")
    assert r.headers["cache-control"] == "no-store"
    [paper] = r.json()
    assert (paper["readingId"], paper["title"], paper["openCount"], paper["keptByCaseWorker"]) == (
        rid, "Parole conditions", 5, False)
    assert paper["nextDue"] == "2026-10-12"   # 72 hours after Maria's release
    assert (await env["http"].get("/auth/client/papers", params={"q": "parole"})).json()
    assert (await env["http"].get("/auth/client/papers", params={"q": "housing"})).json() == []


@pytest.mark.asyncio
async def test_upcoming_is_soonest_first_with_undated_last(env):
    await keep_one(env, PAGE_1)
    items = (await env["http"].get("/auth/client/papers/upcoming")).json()
    dates = [i["action"]["due"].get("resolvedDate") for i in items]
    assert dates == ["2026-10-12", "2026-10-30", "2026-11-01", None, None]
    assert items[0]["paperTitle"] == "Parole conditions"
    assert items[0]["action"]["checkedByCaseWorker"] is False


@pytest.mark.asyncio
async def test_check_off_and_undo(env):
    rid = await keep_one(env, PAGE_1)
    paper = (await env["http"].get(f"/papers/{rid}")).json()
    first = paper["actions"][0]
    r = await env["http"].patch(f"/papers/actions/{first['id']}", json={"done": True})
    assert r.json()["completed"] is True
    assert len((await env["http"].get("/auth/client/papers/upcoming")).json()) == 4
    assert (await env["http"].get(f"/papers/{rid}")).json()["actions"][0]["completed"] is True
    await env["http"].patch(f"/papers/actions/{first['id']}", json={"done": False})
    assert len((await env["http"].get("/auth/client/papers/upcoming")).json()) == 5


@pytest.mark.asyncio
async def test_a_client_cannot_reach_another_clients_papers(env):
    rid = await keep_one(env, PAGE_1)
    action_id = (await env["http"].get(f"/papers/{rid}")).json()["actions"][0]["id"]
    env["who"]["user"] = env["other"]
    assert (await env["http"].get(f"/papers/{rid}")).status_code == 404
    assert (await env["http"].patch(f"/papers/actions/{action_id}", json={"done": True})).status_code == 404
    assert (await env["http"].delete(f"/auth/client/papers/{rid}")).status_code == 404
    assert (await env["http"].get("/auth/client/papers")).json() == []


@pytest.mark.asyncio
async def test_case_worker_sees_only_assigned_clients_papers(env):
    rid = await keep_one(env, PAGE_1)
    env["who"]["user"] = env["staff"]
    assert (await env["http"].get(f"/papers/{rid}")).status_code == 200   # Maria is assigned
    async with env["Session"]() as s:
        await s.execute(update(Assignment).values(is_active=False))
        await s.commit()
    assert (await env["http"].get(f"/papers/{rid}")).status_code == 404


@pytest.mark.asyncio
async def test_remove_a_paper_the_client_kept(env):
    rid = await keep_one(env, PAGE_1, PAGE_2)
    r = await env["http"].delete(f"/auth/client/papers/{rid}")
    assert r.status_code == 204
    assert await count_rows(env) == [0, 0, 0]


@pytest.mark.asyncio
async def test_a_paper_the_case_worker_kept_stays(env):
    env["who"]["user"] = env["staff"]
    rid = await keep_one(env, PAGE_1, data={"client_id": str(env["maria"].id)})
    env["who"]["user"] = env["maria"]
    r = await env["http"].delete(f"/auth/client/papers/{rid}")
    assert r.status_code == 403
    assert (await env["http"].get("/auth/client/papers")).json()[0]["keptByCaseWorker"] is True
