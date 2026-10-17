# Recorded package sets — deployed fleet images

`pip freeze` output captured from the **live** `hermes-gateway:*` images on
2026-10-17. Each file was verified to match the running image byte-for-byte at
capture time.

| File | Image tag | Packages | Runs |
|---|---|---|---|
| `image-fixed.txt` | `hermes-gateway:fixed` | 61 | ernest, gordon, jerry, r2d2, sherlock, sonic |
| `image-croniter.txt` | `hermes-gateway:croniter` | 62 | c3po |
| `image-bruce-croniter.txt` | `hermes-gateway:bruce-croniter` | 44 | bruce |

## Why these exist

The Dockerfiles had **drifted away from the images that are actually deployed**:

- `Dockerfile.agent` installs `croniter`, but the `:fixed` image does not have it
  (the separate `:croniter` tag exists precisely because of that gap)
- `Dockerfile.bruce` was a stale subset — bruce's image was missing `psutil`,
  `python-telegram-bot`, `edge-tts`, `boto3`, `truststore` and `ruamel.yaml`

Neither Dockerfile pins versions (`grep -c "=="` → 0), so a *full* rebuild would
re-resolve every package from PyPI at today's versions and produce images that
differ from what is running — unpredictably. These dumps remove the guesswork:
they record what is actually deployed.

`Dockerfile.bruce` has been aligned to `Dockerfile.agent` so the two no longer
diverge. The remaining known gap is `croniter` in `:fixed` — see runbook §11.6.

## Runtime caveat (important)

At runtime these packages are **shadowed** by the Hermes-managed venv — Python
3.14, selected by `docker-entrypoint.sh`. The managed venv supplies the real
dependency closure, and the two do **not** match. In particular `edge-tts` and
`boto3` are absent from the managed venv across every agent; they are optional
PM extras enabled with:

```bash
hermes pm install --extra edge-tts
hermes pm install --extra boto3
```

So this pip list is a **fallback** for when the managed environment is missing
or damaged — not the primary runtime. Do not treat a missing entry here as a
missing capability, or vice versa.

## Verifying a candidate image against these records

```bash
docker run --rm --entrypoint pip hermes-gateway:fixed freeze | sort | diff - requirements/image-fixed.txt
```

No output means the image still matches the recorded deployed set.

## Rebuild policy

Do **not** do a full `docker build` from these Dockerfiles to "sync" them —
the version pins don't exist, so it changes packages for no functional gain.
The supported path is a minimal layer on top of the existing image:

```dockerfile
FROM hermes-gateway:<tag>
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
```

That preserves the recorded package set exactly. Old images are retained as
`hermes-gateway:<tag>-prerebuild-*` for rollback.
