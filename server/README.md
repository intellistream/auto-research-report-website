# Website backend

Independent Python3.11+ research_workbench package, no SAGE or upstream checkout.
Common modules originate from reviewed e485fd1 composition. Auth/research migrate
separately with exact provenance; frontend remains at repository root.

Install: python -m pip install -e ./server[dev]
Backend tests: cd server && python -m pytest
See INTERNAL_EXECUTION_V1.md for server protocol and parallel module exports.
Common skeleton is an implementation base; full app needs reviewed auth/research.
Model credentials/generation code belong only to the separate engine.
No private backend data/configuration belongs under public.
