# npm publication records

These JSON records preserve verified npm publication metadata in the repository. They are library records, not Wonffice product release approvals. They retain the source commit, run/attempt/artifact identity, report contents and original report SHA-256 values, archive SHA-256 and SHA-512 integrity, and intended `<package>@<version>` Git tags.

The original report checksums describe the downloaded report bytes, including their formatting. The embedded `contents` objects preserve the report data; reserializing them is not a byte-for-byte copy of the original files. Package archive checksums are independently verifiable against the exact npm versions.

## Generate a record without publishing

Use the repository's Node version, installed dependencies, authenticated `gh`, Git, `unzip` and `tar`. Fetch the published source commit into the repository first. None of the commands below updates remote tags or npm.

For the first verified batch:

```sh
pnpm release:npm:record \
  --run-id 35484224273 \
  --attempt 2 \
  --artifact-id 10596258684 \
  --out releases/npm/b300ea1ac43bd45958a89dea3d2d3548cc48cfda.json
```

Without `--out`, the command prints the record and tag plan. With `--out`, it also saves the record locally. An identical existing record is reused. Different content at that path is rejected. Review and commit the record in a normal main-based PR with the required checks. A local file or Actions artifact alone is not durable repository history.

The command checks:

1. An exact successful manual `npm-release.yml` attempt on main in this repository.
2. The artifact's run/source identity, ZIP digest and creation time inside that attempt's successful upload step. Explicit artifact selection avoids confusing failed and successful retries with the same name.
3. A `published` report, matching consumer/manifest hash, complete public-package coverage from the historical source commit, and every archive's contents, identity and hash.
4. Every exact npm version's identity and SHA-512 integrity. A newer npm `latest` is allowed when recording an older release.
5. All existing remote tags. Lightweight and annotated tags are resolved to their commit. A matching tag is reused; any different target stops planning. The command never moves a tag.

The committed first record covers 31 packages published from `b300ea1ac43bd45958a89dea3d2d3548cc48cfda`. Its tag plan initially contains 31 missing tags. Recording this fact does not create those tags.

## Separate tag and GitHub Release step

After the record PR is reviewed and merged, the release owner can authorize tag creation. Rerun the read-only plan immediately before that action while the artifact remains available. Each new tag must use the record's full `sourceCommit`; do not tag the record PR's commit or current HEAD.

For each planned tag, verify the remote again, create only an absent ref at that exact commit, and push only that named ref. Reuse an existing tag only after resolving it to the same commit. Never use `--force`, move an existing tag, or push all local tags. Stop on a conflicting ref and inspect it. GitHub Releases, if used, must refer to those already verified tags and link the record and original run. Do not mark library records as Wonffice product releases or change product release versions.

This PR provides the verified record and plan; it does not add a remote-write command or automatically execute this owner step. Publication approval remains separate from repository maintenance.

## Retention and recovery

Generate and merge the record before the release workflow's 14-day artifact retention expires. The JSON is retained in Git independently of Actions retention. Package bytes remain available as exact npm versions; this record does not back up the tarballs or guarantee npm retention.

If the Actions ZIP has expired, this generator fails instead of fabricating fresh artifact evidence. Use the reviewed record as historical evidence. Recheck exact npm versions and downloaded tarballs against both recorded hashes, fetch the source commit, and recheck remote tag targets before proposing any recovery action. A record alone does not authorize writes.

If a publication was partial or uncertain, resolve it through the npm publication recovery procedure first. Do not turn a failed publication report into a successful record. If a record needs correction, preserve the original evidence and explain the correction in a reviewed PR; do not silently replace it with a later attempt.
