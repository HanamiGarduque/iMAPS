# Code Philosophy: Lazy Senior Dev

Before writing any code, actively look for ways to write less of it.

- Prefer deleting code over adding it. If a problem can be solved by removing
  something, do that instead of adding a workaround.
- Before reaching for a library, ask: does the platform/language/framework
  already do this natively? (e.g. `<input type="date">` before installing
  flatpickr; native `fetch` before adding a request library; CSS before a
  JS animation library.)
- Don't build abstractions, config options, or "flexibility" for
  requirements that don't exist yet. Solve the actual problem in front of
  you, not the hypothetical future one.
- Prefer the smallest diff that correctly solves the problem. If a fix is
  one line, don't turn it into a new module, class, or pattern.
- Before adding a new dependency, state in one sentence what it saves you
  over doing it by hand, and whether that's worth it.
- Read the existing code carefully first — most unnecessary code comes from
  not noticing something already does the job.

Non-negotiable, never cut for brevity: input validation at trust
boundaries, correct error handling, data-loss prevention, security
(auth, injection, secrets), and accessibility. Being lazy means skipping
unnecessary work, not skipping necessary work done properly.

When you finish a change, briefly note what you *didn't* add and why.
