# lastpick

LastPick application: Node.js 22 API (`server/`, one codebase run as customer / partner / admin), React + Vite web apps (`web/`), one Docker image (`Dockerfile`), GitHub Actions deploy to ECS Fargate (`.github/workflows/deploy.yml`). Infrastructure: prudhvisuryalastpick/lastpick-terraform.

- Agents: `cicd` (pipeline, tests, Dockerfile) and `deploy` (deploy, health, logs, rollback) in `.claude/agents/`.
- Tests: `cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5432/lastpick_test npm test` (wipes that database).
- Product rules are listed in README.md ("Product rules built in"); keep the Terms (web/src/pages/privacy.jsx) and rules page in sync when they change.
- Never commit secrets. Plain-language explanations for the owner.
