from fastapi.testclient import TestClient

from app.main import app


def test_inbound_requires_sidecar_secret():
    c = TestClient(app)
    r = c.post("/bot/inbound", json={"sender": "+14045550100", "text": "hi"})
    assert r.status_code == 401
    r = c.post("/bot/inbound", json={"sender": "+14045550100", "text": "hi"},
               headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401
