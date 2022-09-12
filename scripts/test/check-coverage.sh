#!/bin/bash

set -e
echo `pwd`
forge coverage --report lcov
genhtml lcov.info --branch-coverage --output-directory coverage
open coverage/index.html
