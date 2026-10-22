# Private source backup

Create the secret-free source archive with Python 3.9 or later:

```sh
python3 tools/backup_project.py --output ../backups/Masiyatunda-MilkyWay-BETA-BACKUP.zip
```

The output must be outside this website repository. An existing archive is never
overwritten. The exporter preserves relative paths, including the root website,
MilkyWay app, Supabase functions, SQL, Netlify configuration, images and documentation.
It excludes Git history, dependencies, generated/local Netlify state, environment
files, private key files, logs, temporary files and symlinks.

Embedded recognizable API keys, tokens, password literals and URL credentials are
replaced **only in archive copies** with `BACKUP_RESTORE_CREDENTIAL`. Originals
remain untouched. `BACKUP-MANIFEST.json` lists every included source file and every
sanitized file. Automated pattern checks cannot guarantee detection of arbitrary,
unlabelled credentials; review custom configuration before sharing any backup.
Explicit, non-production test markers are retained only in `.test.mjs` files so
cryptographic fixture tests remain runnable. Provider-key patterns, JWT literals
and private keys are still sanitized in those files.

On restoration, extract into a new directory and restore the necessary configuration
privately. Browser Supabase configuration requires the project's public/publishable
key; never substitute a service-role or secret key. Configure LiveKit API secrets and
other server credentials in the server environment, not client code or this archive.
The archive is a **source-code backup**, not an export of hosted Supabase data,
authentication accounts, uploaded media, or external services.

## Export from Netlify when archive downloads are unavailable

Netlify documents source export for projects not already linked to an external Git
repository: open **Project configuration → Developer settings → Continuous deployment
→ Repository**, then **Link to repository → Push to new repository**. Follow the
GitHub setup prompts and keep the destination repository private. If your project
is already linked to your own Git repository, obtain the source from that repository
instead. If the export option is unavailable for this Netlify-managed project,
contact Netlify support for a complete source export; a deployed-site download is
not sufficient.

Clone the private repository (or use GitHub's **Code → Download ZIP**, then extract)
and run the command above to produce the sanitized archive on your computer. The
Netlify repository setup enables continuous deployment; do not push further changes
unless you intend to trigger deployment. No repository setup or deployment was
performed by the backup script.

Exporting the project itself retains its original embedded public/publishable keys;
keep that repository private and use this exporter before distributing a backup.
Netlify's **Download deploy** contains deployed assets, not necessarily all source,
SQL and function code, so it is not a replacement for the source export.
