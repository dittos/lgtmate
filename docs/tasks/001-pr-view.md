let's start adding new real routes.

Route path: `/:owner/:repo/pull/:number` -- the Pull Request view.

The page structure:

* Header
    * pull request title
    * metadata (single line): owner/repo #number, state (open/merged/closed), by `author`, headRef -> baseRef
    * a link to GitHub PR page: View on GitHub
* Main: horizontal split pane
    * Left: file tree of changed files in the PR.
    * Right: the selected file's diff viewer.
        * when no file is selected (initial state), render PR description

The entire page should not be scrollable but fully filled.
In the main part, each panes (left/right) are separately scrollable if overflowed.

Selecting the file just updates the URL query: `?path={path}`
File viewer should update by reacting to the URL query changing.

Use GitHub's GraphQL API to fetch most things except the diff (patch).

Use https://diffs.com/ to render the diff.
