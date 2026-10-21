#!/bin/sh
# Publish The Thinking Place to GitHub (github.com/theopelle/thethinkingplace).
#
#     sh reflect/tools/push_github.sh
#
# The local repository also holds Noniin and private working files, so GitHub gets a
# filtered copy: only this folder, without the files below, and every save signed with
# the GitHub username's private address. The same input always gives the same copy, so
# each run simply adds the new saves on top of what is already online.
set -e
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

LEAVE_OUT="exports brand/drafts brand/names.html brand/names-round2.html brand/preview.html brand/quote-marks.html CLAUDE.md NEXT_STEPS.md"
NAME="theopelle"
EMAIL="theopelle@users.noreply.github.com"
REMOTE="https://github.com/theopelle/thethinkingplace.git"
BRANCH="thinkingplace-github"

git branch -D "$BRANCH" >/dev/null 2>&1 || true
git subtree split --prefix=reflect -b "$BRANCH" >/dev/null 2>&1
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --prune-empty \
  --index-filter "git rm -r -q --cached --ignore-unmatch $LEAVE_OUT" \
  --env-filter "export GIT_AUTHOR_NAME='$NAME' GIT_AUTHOR_EMAIL='$EMAIL' GIT_COMMITTER_NAME='$NAME' GIT_COMMITTER_EMAIL='$EMAIL'" \
  "$BRANCH" >/dev/null
echo "Ready: $(git rev-list --count "$BRANCH") saves, $(git ls-tree -r --name-only "$BRANCH" | wc -l | tr -d ' ') files."
[ "$1" = "--dry-run" ] && exit 0
git push "$REMOTE" "$BRANCH:main" "$@"
