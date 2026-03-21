# Instructions for Agents

These instructions are intended for AI agents working on this project.

1.  **Type Definitions**:
    - Always add type definitions on both the backend and frontend codebase.
    - Backend (Python): Use type hints for all function parameters, return types, and variable annotations.
    - Frontend (TypeScript/JavaScript): Use explicit types for props, state, function parameters, and return values.
    - Frontend (TypeScript/JavaScript): Always use CSS classes instead of inline styles for styling components.

2.  **Docker Environment**:
    - The project is designed to run within a Docker Compose environment.

3.  **Docker Privileges**:
    - Be aware that running Docker commands may require `sudo` privileges depending on the user's environment.

4.  **How to Test Backend Changes**:
    - Run the helper script:
      - `./test.sh`                                          # Run all backend tests once
      - `./test.sh tests/unit/test_submission_handler.py`    # Run a specific test file
      - `./test.sh --coverage`                               # Run with terminal coverage output
      - `./test.sh --rebuild`                                # Rebuild the backend test image first when using Docker Compose
    - The helper runs tests directly when executed inside an agent/container environment with local dependencies available, and falls back to Docker Compose on host environments.
    - To run without Docker (if dependencies are installed locally):
      - `pytest`
      - `pytest tests/unit/test_submission_handler.py -v`
    - To run tests using the local MongoDB binary:
      - `./test_mongodb/start_mongo.sh`                     # Starts MongoDB on port 27017
      - `export MONGODB_URL=mongodb://localhost:27017/`     # Set environment variable
      - `pytest`                                             # Run tests
      - `./test_mongodb/stop_mongo.sh`                      # Stops MongoDB
    - For uncommon pytest flags, run `pytest` directly or use Docker Compose directly.
    - See `TESTING.md` for full details on test structure and writing new tests.

5.  **How to Test Frontend Changes**:
    - Run frontend tests using the helper script:
      - `./frontend-test.sh`                              # Run all tests once
      - `./frontend-test.sh src/App.test.jsx`             # Run a specific test target
      - `./frontend-test.sh --coverage`                   # Run with coverage enabled
      - `./frontend-test.sh --rebuild`                    # Rebuild image and refresh cached dependencies when using Docker
    - The helper runs tests directly when executed inside an agent/container environment with local Node dependencies available, and falls back to Docker on host environments.
    - Or run directly in the frontend directory:
      - `cd /app/frontend && npm test -- --watchAll=false`
      - `cd /app/frontend && npm run test:coverage`
    - Frontend tests should cover safe HTML sanitization and topic/read-unread highlighting behavior.

6.  **How to Run Linters and Formatters**:
    - Run all linters using the helper script:
      - `./lint.sh`                                       # Run all lint checks
      - `./lint.sh check backend`                         # Run only backend lint checks
      - `./lint.sh fix frontend`                          # Auto-fix frontend lint issues
      - `./lint.sh format`                                # Format backend and frontend code
    - The helper runs local tools directly inside agent/container environments when available, and only falls back to Docker for backend linting on host environments that lack `ruff`.
    - To run without Docker (if dependencies are installed locally):
      - `ruff check .` / `ruff format .`                  # Python
      - `cd /app/frontend && npm run lint`                # JavaScript/TypeScript
      - `cd /app/frontend && npm run format`              # Prettier formatting

7.  **LLM Changes**:
    - If you need to add or modify any LLM related features (client creation, prompt engineering, caching, or settings), you **MUST** consult the [LLM Architecture Guide](docs/llm_handler.md) first to ensure consistency with the existing design patterns and dynamic runtime switching.
