# EPS Lazy Chop Patcher

[Open the browser patcher](https://mardlib.github.io/eps-lazy-chop-patcher/)

Apply experimental Lazy Chop **T11** to your own unmodified **Ensoniq EPS-16 Plus OS 1.30** disk image. All processing happens locally in your browser. This repository contains patch instructions and extension source, **no Ensoniq OS image**.

## Use

1. Open the patcher and choose your original OS disk: 800 KiB IMG or standard HFE v1 (80 tracks, two sides, 250 kbit/s).
2. Click **Verify & apply patch**. The patcher verifies the original OS payload, the patched payload, and all 1,600 output sectors.
3. Download `EPS130-LAZY-T11.hfe`, copy it to your Gotek USB drive, select it and restart your sampler.

HFE v3 is unsupported. The original EPS and ASR-10 are unsupported. No OS download is provided.

## Lazy Chop

Start with a freshly recorded mono sample in one layer. Select **COMMAND → WAVE → LAZY CHOP**, at the end of the menu. Play the root key to start capture, then play additional notes to set markers. Press **YES** to apply, then **YES** again to exit. Chops are mapped to consecutive keys from the root key. Save with the normal **SAVE INSTRUMENT** command.

- Up to 16 chops per pass; the available keyboard range can reduce this limit.
- Wavesample aliases share the original audio; no separate audio copies are made.
- Sample start/end and loop boundaries follow each chop.
- Chopping has been confirmed on real EPS-16 Plus hardware.
- Automatic chop naming is not working reliably. No undo is included.
- Repeated passes add aliases rather than reusing them and consume wavesample slots.

**Disabled commands:** COMMAND → SEQ/SONG, COMMAND → TRACK, COPY FLOPPY, COPY SCSI DRIVE, and BACKUP/RESTORE. T11 reuses their code/table space. The sequencer engine has not been completely removed.

## Implementation

`patch.json` contains checksums, new extension bytes, and a copy operation. The copy operation relocates the original Wave menu rows from the user's own OS; those rows are not bundled here. Only the native OS file's sectors change. Other disk sectors are preserved. The output is encoded as a writable HFE v1 disk and decoded again for verification.

`patch-source/lazychop.s` and `patch-source/layout.ld` contain the 68000 extension and overlay layout. The reserved menu area is filled from the user's image at patch time. These sources are provided for inspection; the tested release patch is `patch.json`.

## Development

No dependencies or build step are needed for the website. Serve this directory with any static HTTP server, for example:

```sh
python3 -m http.server 8791
```

Run synthetic tests with Node.js 22 or newer:

```sh
npm test
```

An optional private integration test compares the result byte for byte with local T11 reference images. Set `TEST_EPS_ORIGINAL`, `TEST_EPS_T11_IMG`, and `TEST_EPS_T11_HFE` to local paths. Never commit those images. The public test suite uses generated synthetic data only.

Unofficial experimental project; not affiliated with Ensoniq.
