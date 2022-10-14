#!/bin/bash

set -e
echo `pwd`
forge coverage --report lcov --optimize
echo "forge finished";
genhtml lcov.info --branch-coverage --output-directory coverage
open coverage/index.html
