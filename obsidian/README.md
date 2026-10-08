# Writing Jesus at Home in Obsidian

These files make a note in Obsidian look the way it will look on the website.

| File | What it is |
|---|---|
| `jesus-at-home.css` | A CSS snippet that styles Jesus at Home notes like the site |
| `Jesus at Home Template.md` | The weekly template with every section and callout set up |

## One-time setup

### 1. Install the look (CSS snippet)
1. In Obsidian, open **Settings → Appearance**. Scroll to **CSS snippets** and click the folder icon. This opens `<your vault>/.obsidian/snippets/`.
2. Copy `jesus-at-home.css` into that folder.
3. Back in **Settings → Appearance → CSS snippets**, click the refresh icon and switch **jesus-at-home** on.

The snippet only affects notes that have `cssclasses: jesus-at-home` in their properties. The template adds this for you, so the rest of your vault keeps its normal theme.

> **Fonts:** The snippet loads Archivo Black and Hanken Grotesk from Google Fonts when you're online. If you write offline often, install both fonts on your computer from fonts.google.com so the preview always matches the site.

### 2. Install the template
1. Turn on the core **Templates** plugin: **Settings → Core plugins → Templates**.
2. In **Settings → Templates**, set **Template folder location** to your templates folder.
3. Copy `Jesus at Home Template.md` into that folder.

## Each week
1. Create a new note. You can name it anything, such as `2026-10-15 Return to the Lord`.
2. Run **Templates: Insert template** from the command palette (Ctrl/Cmd + P) and choose **Jesus at Home Template**. The week date fills in automatically.
3. Write the devotional.
4. Switch to **Reading view** (Ctrl/Cmd + E) to see it as families will.
5. Check the properties at the top:
   - `week:` is the date the devotional is for. It also names the archive copy.
   - `notify:` is the notification text. Keep it short; phones show about 110 characters. Set it to `notify: false` to publish without a notification (for example, when fixing a typo).
6. Go to **/admin.html**, sign in, choose **Publish Devotional**, and upload the note. The file name doesn't matter. It's saved as `content.md`, which is the file the site reads.

## Formatting reference

| Write this | Site shows |
|---|---|
| `> [!scripture] John 3:16 (ESV)` | Cream Scripture card |
| `> [!mainidea] Main Idea` | Large, bold statement |
| `> [!quickwin] This Week's Quick Win` | Solid blue box |
| `> [!prayer] Pray Together` | Centered, set-apart prayer |
| `> [!tip] Remember` (or any other type) | Light blue callout |
| `==highlighted==` | Highlighted text |
| `%% note to self %%` | Hidden |
| `[[Some Note]]` | Plain text "Some Note" |
| `![[image.png]]` | Left out, because vault images don't upload with the note |

Always give a callout a title (`> [!quickwin] This Week's Quick Win`). Without one, both Obsidian and the site fall back to the bare type name ("Quickwin").
