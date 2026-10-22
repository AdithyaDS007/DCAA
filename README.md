# DCAA Studio

A standalone workspace for design accessibility annotations and customer reports. This is prepared for a separate `dcaa-studio` repository; it does not replace Annotation-Studio.

[Open the app](./index.html) · [Download editable source](./DCAA-Image-Annotator-source.zip)

## Features

- Create, open, rename, and duplicate projects with customer names and saved-work previews.
- Upload screenshots, draw annotation regions, and edit notes, review status, severity, ownership, and references.
- Use 184 original Deque stamps, custom tags, colors and border patterns, plus WCAG 2.1/2.2 and platform filters.
- Extract reusable components and preserve their annotations and reading/focus order.
- Save editable JSON backups and prepare self-contained HTML reports with embedded screenshots and stamps. Reports are snapshots; update the project and prepare a new report after changes.

The interface, stamps, and font are embedded in `index.html`. External reference links need internet access. AI is disconnected.

## Your projects and backups

Projects save automatically in this browser on this device, using IndexedDB. Check the save indicator before closing. There are no shared accounts, cloud project storage, or collaborative editing. Hosting these application files does not upload your screenshots or projects.

Use **Save project** to download an editable JSON backup including screenshots. **Open project** or **Open project backup** imports it as a separate project, preserving the previous project.

Browser storage belongs to a browser profile and origin. Work in the local HTML file or another website will not automatically appear here. To move it, save a JSON backup in the old app, then open that backup here. Keep backups before clearing browser storage or changing browsers.

## Editable source

Extract `DCAA-Image-Annotator-source.zip`, then run:

```sh
python build.py
```

Python 3 rebuilds `index.html` from the baseline and upgrade modules. The archive includes the embedded stamp data and required brand/font assets; no original reference documents or customer projects are needed. It excludes QA fixtures. Inter's SIL Open Font License is included in [Inter-OFL.txt](./Inter-OFL.txt).

## Verification limits

The release passed focused validation, persistence, project-switching, component, stamp, WCAG-library, and report checks, plus an assembled workflow smoke test. Those tests use lightweight DOM and IndexedDB fixtures. Real-browser visual layout, printing, keyboard interaction, and assistive-technology checks remain pending. Automated checks do not establish WCAG conformance; annotations still require human review of the design and implementation.
