"""Canned AI output for development: a made-up Georgia parole letter. All names, numbers and
addresses are fictional (555 phone numbers are reserved for fiction). Keys are the camelCase
names Gemini returns."""

FAKE_PAGES: list[dict] = [
    {
        "confidence": 0.94,
        "problem": None,
        "text": """STATE OF GEORGIA
DEPARTMENT OF COMMUNITY SUPERVISION
Atlanta District Office, 123 Main St, Atlanta, GA 30303

October 5, 2026

Case No. 2026-CR-0412

CONDITIONS OF PAROLE SUPERVISION

1. Report to your supervising officer within 72 hours of release. Bring a photo ID and your release papers.
Officer J. Smith, (404) 555-0100.

2. You must not leave the State of Georgia without written permission from your supervising officer.

3. Pay a supervision fee of $30.00 each month. The first payment is due by November 1, 2026.

4. Submit to drug testing when directed.""",
    },
    {
        "confidence": 0.88,
        "problem": "Signature line is faint",
        "text": """5. Notify your supervising officer within 10 business days of any change of address or employment.

6. Complete the Reentry Orientation class at 456 Peachtree Ave, Room 2B, by October 30, 2026.

Failure to comply with any condition may result in a violation report and revocation of parole.

I have read and understand these conditions.

Signature: ______________________  Date: __________""",
    },
]

FAKE_CLASSIFY: dict = {
    "docType": "parole_conditions",
    "title": "Parole conditions",
    "issuer": "Georgia Department of Community Supervision",
    "documentDate": "2026-10-05",
}

FAKE_SIMPLIFY: dict = {
    "markdown": """## What this is
This paper lists the rules of your parole. It is from the Georgia Department of Community Supervision. Your case number is 2026-CR-0412.

## What it means for you
You must follow every rule on this paper while you are on parole.

## What you need to do
- Meet your parole officer within 72 hours of your release. Bring a photo ID and your release papers. Officer J. Smith: (404) 555-0100.
- Do not leave Georgia unless your parole officer gives you written permission.
- Pay $30.00 every month. The first payment is due by November 1, 2026.
- Take a drug test when you are told to.
- Tell your parole officer within 10 business days if you move or change jobs.
- Finish the Reentry Orientation class at 456 Peachtree Ave, Room 2B, by October 30, 2026.

## What happens if you don't
If you break a rule, your officer can file a violation report. Your parole could be taken away.""",
    "glossary": [
        {"term": "Parole", "meaning": "Time you spend in the community under supervision after prison."},
        {"term": "Supervising officer", "meaning": "Your parole officer."},
        {"term": "Revocation", "meaning": "When your parole is taken away and you may go back to prison."},
        {"term": "Violation report", "meaning": "A report your officer files when a rule is broken."},
    ],
}

NONE_DUE = {
    "type": "none", "text": None, "exactDate": None, "anchor": None,
    "offsetHours": None, "offsetDays": None, "businessDays": None,
}
OFFICER = {"name": "Officer J. Smith", "phone": "(404) 555-0100", "email": None}

FAKE_ACTIONS: dict = {
    "actions": [
        {
            "order": 1,
            "title": "Meet your parole officer",
            "details": "Go to the parole office in person.",
            "due": {**NONE_DUE, "type": "relative", "text": "within 72 hours of release",
                    "anchor": "release_date", "offsetHours": 72},
            "location": "123 Main St, Atlanta, GA 30303",
            "contact": OFFICER,
            "bring": ["Photo ID", "Release papers"],
            "priority": "urgent",
            "consequence": "Missing this can lead to a violation report.",
            "sourceQuote": "Report to your supervising officer within 72 hours of release.",
            "sourcePage": 1,
            "confidence": 0.95,
        },
        {
            "order": 2,
            "title": "Finish the Reentry Orientation class",
            "details": "Go to the class and complete it.",
            "due": {**NONE_DUE, "type": "exact", "text": "by October 30, 2026", "exactDate": "2026-10-30"},
            "location": "456 Peachtree Ave, Room 2B",
            "contact": None,
            "bring": [],
            "priority": "urgent",
            "consequence": None,
            "sourceQuote": "Complete the Reentry Orientation class at 456 Peachtree Ave, Room 2B, by October 30, 2026.",
            "sourcePage": 2,
            "confidence": 0.92,
        },
        {
            "order": 3,
            "title": "Pay your first supervision fee",
            "details": "Pay $30.00. After that, pay $30.00 every month.",
            "due": {**NONE_DUE, "type": "exact", "text": "by November 1, 2026", "exactDate": "2026-11-01"},
            "location": None,
            "contact": None,
            "bring": [],
            "priority": "normal",
            "consequence": None,
            "sourceQuote": "The first payment is due by November 1, 2026.",
            "sourcePage": 1,
            "confidence": 0.9,
        },
        {
            "order": 4,
            "title": "Tell your officer if you move or change jobs",
            "details": "Call or visit your parole officer each time your address or job changes.",
            # Counts from the move or job change, not from the paper's date: no fixed day.
            "due": {**NONE_DUE, "text": "within 10 business days of any change of address or employment"},
            "location": None,
            "contact": OFFICER,
            "bring": [],
            "priority": "normal",
            "consequence": None,
            "sourceQuote": "Notify your supervising officer within 10 business days of any change of address or employment.",
            "sourcePage": 2,
            "confidence": 0.7,
        },
        {
            "order": 5,
            "title": "Stay in Georgia",
            "details": "Do not leave the state unless your parole officer gives you written permission.",
            "due": NONE_DUE,
            "location": None,
            "contact": OFFICER,
            "bring": [],
            "priority": "urgent",
            "consequence": None,
            "sourceQuote": "You must not leave the State of Georgia without written permission from your supervising officer.",
            "sourcePage": 1,
            "confidence": 0.97,
        },
    ],
}
