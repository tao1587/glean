# Admin Setup

## Local Development

- Quick setup: `python backend/scripts/create-admin.py`
- Default development credentials: `admin` / `Admin123!`
- Admin dashboard URL: `http://localhost:3001`

## Docker

- Set `CREATE_ADMIN=true` in `.env` to auto-create the admin account on startup
- Or run `docker exec -it glean-backend /app/scripts/create-admin-docker.sh`

## Related Docs

- `docs/operations/personal-deployment-guide.md`
- `README.md`
