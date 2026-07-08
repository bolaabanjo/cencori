# Contributing to Cencori Python SDK

Thanks for your interest in contributing! This document covers the development workflow.

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) — fast Python package installer and resolver
- [just](https://github.com/casey/just) — command runner (install via `brew install just` or `cargo install just`)
- [pre-commit](https://pre-commit.com) — git hook framework

## Setup

```bash
# Clone the repo and enter the directory
git clone git@github.com:cencori/cencori-python.git
cd cencori-python

# Install dependencies and pre-commit hooks
just setup
```

This creates a virtual environment, installs all dependencies (including dev), and sets up git hooks.

## Development Workflow

### Run all checks

```bash
just check
```

This runs: lint → format check → type check → tests.

### Individual commands

```bash
just lint        # Ruff linting
just format      # Auto-format code
just fix         # Auto-fix lint issues
just typecheck   # Mypy type checking
just test        # Run tests (pytest -v)
```

### Pre-commit hooks

Hooks are defined in `.pc.yaml` and run automatically on `git commit`. They check:

- **ruff** — lints and auto-fixes
- **ruff-format** — ensures consistent formatting
- **mypy** — type-checks the source
- **trailing-whitespace** — removes trailing whitespace
- **end-of-file-fixer** — ensures files end with a newline

You can also run them manually:

```bash
just hooks-run    # Run pre-commit on all files
just hooks-update # Update hook versions
```

## Project Structure

```
src/cencori/
├── __init__.py    # Public API surface, re-exports
├── client.py      # Main client + stub modules (Compute, Workflow, Storage)
├── ai.py          # AIModule — chat, streaming, embeddings
├── projects.py    # ProjectsModule — CRUD
├── api_keys.py    # APIKeysModule — key management
├── metrics.py     # MetricsModule — usage analytics
├── errors.py      # Error hierarchy
└── types.py       # All dataclass types
tests/             # Pytest tests (mirror src structure)
examples/          # Usage examples
```

## Pull Request Guidelines

1. Create a branch from `main` with a descriptive name (`feat/...`, `fix/...`, `chore/...`)
2. Make your changes, keeping them focused and minimal
3. Run `just check` and ensure everything passes
4. Commit using clear messages (we use conventional commits)
5. Push and open a PR

## Adding Dependencies

```bash
uv add <package>           # Runtime dependency
uv add --dev <package>     # Dev dependency
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
