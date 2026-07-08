# Cencori Python SDK — justfile
# Run with: `just <command>`

uv := "uv"
ruff := uv + " run ruff"
mypy := uv + " run mypy"
pytest := uv + " run pytest"
precommit := uv + " run pre-commit"

# ── Setup ────────────────────────────────────────────────────────────────

# Install the project and all dependencies
setup:
    {{ uv }} venv
    {{ uv }} sync --extra dev
    {{ uv }} run pre-commit install --config .pc.yaml

# ── Lint & Format ────────────────────────────────────────────────────────

# Lint with ruff
lint:
    {{ ruff }} check src/

# Auto-fix lint issues
fix:
    {{ ruff }} check --fix src/

# Format code with ruff
format:
    {{ ruff }} format src/

# Check formatting (CI-safe)
format-check:
    {{ ruff }} format --check src/

# Type-check with mypy
typecheck:
    {{ mypy }} src/

# ── Test ─────────────────────────────────────────────────────────────────

# Run tests
test:
    {{ pytest }} -v

# Run tests with coverage
test-cov:
    {{ pytest }} -v --cov=src --cov-report=term

# ── Pre-commit ───────────────────────────────────────────────────────────

# Install pre-commit hooks
hooks:
    {{ precommit }} install

# Run pre-commit on all files
hooks-run:
    {{ precommit }} run --all-files

# Update pre-commit hook versions
hooks-update:
    {{ precommit }} autoupdate

# ── Full Check ──────────────────────────────────────────────────────────

# Run all checks (lint + format-check + typecheck + test)
check: lint format-check typecheck test

# ── Build & Publish ──────────────────────────────────────────────────────

# Build the package
build:
    {{ uv }} build

# Publish to PyPI
publish:
    {{ uv }} publish

# ── Utils ────────────────────────────────────────────────────────────────

# Show outdated dependencies
outdated:
    {{ uv }} pip list --outdated

# Show dependency tree
tree:
    {{ uv }} tree

# Default target
default: check
