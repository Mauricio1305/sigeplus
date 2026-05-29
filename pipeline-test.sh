#!/bin/bash

# Pipeline script to run unit tests and generate a simple report
echo "--- Starting Agenda Routine Unit Tests ---"

# Step 1: Install dependencies (optional if already in container)
# npm install

# Step 2: Run tests with Vitest
npx vitest run --reporter=verbose > test_report.txt

# Step 3: Check exit code
if [ $? -eq 0 ]; then
    echo "SUCCESS: All tests passed!"
    cat test_report.txt
else
    echo "FAILURE: Some tests failed."
    cat test_report.txt
    exit 1
fi

echo "--- Unit Test Report Generated at test_report.txt ---"
