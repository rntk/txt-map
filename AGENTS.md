> **Important — Manage Command Output Size**:
> Commands like test runners, linters, and build scripts can produce very large outputs.
> To avoid blowing up the context window with unnecessary data, **always redirect command output to a temporary file** and then carefully inspect only the relevant parts.
> Example pattern:
> ```bash
> ./test.sh > /tmp/test_output.txt 2>&1
> grep -E "FAILED|ERROR|passed|failed" /tmp/test_output.txt
> # Then open specific sections of the file as needed
> ```
> Use `grep`, `tail`, `head`, or `sed` to extract only the information you need from the output file instead of printing everything to the terminal.

1.  **Type Definitions**:
    - Always add type definitions on both the backend and frontend codebase.
    - Backend (Python): Use type hints for all function parameters, return types, and variable annotations.
    - Frontend (TypeScript/JavaScript): Use explicit types for props, state, function parameters, and return values.
    - Frontend (TypeScript/JavaScript): Always use CSS classes instead of inline styles for styling components.

2.  **Docker Environment**:
    - The project is designed to run within a Docker Compose environment.
    - Running Docker commands may require `sudo` privileges depending on the user's environment.

3.  **Testing**: After making changes, run the relevant tests. See [TESTING.md](TESTING.md) for full details on running backend and frontend tests.
    - Backend: `./test.sh` (or `./test.sh tests/unit/specific_test.py` for a single file)
    - Frontend: `./frontend-test.sh` (or `./frontend-test.sh src/App.test.jsx` for a single file)

4.  **Linting and Formatting**: After making any changes, always run the linter/formatter on changed files before submitting. Ensure all checks pass before considering the task complete. See [docs/linting.md](docs/linting.md) for full details.
    - `./lint.sh format` — format backend and frontend code
    - `./lint.sh` — run all lint checks

5.  **Concise Output**: Keep summaries, descriptions, and generated text brief and to the point. Avoid verbose or repetitive explanations.

6.  **LLM Changes**:
    - If you need to add or modify any LLM related features (client creation, prompt engineering, caching, or settings), you **MUST** consult the [LLM Architecture Guide](docs/llm_handler.md) first to ensure consistency with the existing design patterns and dynamic runtime switching.
