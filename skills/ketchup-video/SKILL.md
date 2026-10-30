---
name: ketchup-video
description: Catch the user up like /flatpaper-stack:ketchup, with a short subtitled video of slides for what happened and the waiting calls as text under it. Use for /ketchup-video.
disable-model-invocation: true
---

# Ketchup video

Follow the `ketchup` skill (`../ketchup/SKILL.md`), but show what happened in a short subtitled video instead of its summary and its before-and-after blocks. Its window starts at the last message the user wrote before `/flatpaper-stack:ketchup-video`, not before any earlier `/flatpaper-stack:ketchup`. Writing and rendering the video outside the repo, and publishing its Artifact page, are the exceptions to its read-only rule. The reply is ketchup's opening sentence, the link to the video, one line naming any work left that you can do yourself, and the action items. The terminal can't play a video, so publish a private Artifact page that plays it in a `<video controls>` tag, with the mp4 sent through the Artifact tool's `files` map, and link that page. Keep the mp4 under 15MB, and re-encode it smaller if it is over. Give the local file path too, since the user needs it to play the video without the page. Without the Artifact tool, give only the path. When the video shows a call's options, call each option by the name the video gives it. Before you draw anything, check for `ffmpeg` (`command -v ffmpeg`) and a headless browser (`command -v google-chrome chromium`, or `/Applications/Google Chrome.app` on macOS). If either is missing, or the render fails, say so in one line and give only the calls.

## Slides

Use the screenshots, recordings, diffs, and data the work produced, not the chat's prose about them. Before you draw, write the one sentence the user should leave with and one line per slide. Drop each slide that does not change what the user knows. Use at most 10 slides, and fewer is better. Neither note goes in the reply.

Each slide makes one point. Build the slides on one picture and change it from slide to slide, rather than cut to an unrelated one. A color or shape means the same thing on every slide. Show the work in pictures, such as how a system works, a PR stack with each PR's state, a before and after of a fix, or options side by side. Point at what changed with arrows, highlights, and motion. A slide is never a bullet list, a status list, a table, or boxes with nothing connecting them.

Keep text to the minimum. Put each label on the thing it names, in plain words a person would say, not tags like "Tests: pass". Never caption what a picture shows, and never give a fact twice, across slides or in the text under them.

Show what came of each thing the user asked for, and whether it is done, still running, failed, or not checked. Never show something done that still waits on the user. Show any bug found and fixed on the way. If a visible change has no screenshot, say so on its slide and name what changed on screen. Draw only from facts you have. Never invent a number, and never draw a screen you did not capture.

## Subtitles

Give each slide one short subtitle line, about ten words, that says its point the way you would tell the user, from only what that slide shows. Say what the picture means rather than read out its labels. Put the subtitle in a strip below the slide, the same height on every slide and empty except for the subtitle, so it never covers the slide. Set it small, but readable when the video plays at chat size.

## Render

Render one silent landscape video, such as an mp4, with motion between slides. Draw each slide as an image, for example HTML screenshotted with headless Chrome, and join them with `ffmpeg` and its `xfade` filter. Work in a new directory under the scratchpad, not the repo. Every frame is the slide itself, edge to edge, above its subtitle strip. Make the frames from the slides, never by recording a screen, and burn each subtitle into its slide's frames so it stays on screen for the slide's whole hold. The hold is the time a slide is fully on screen, not counting the motion into or out of it. Hold each slide long enough to read the words it adds, at least one second for each three words. A slide adds its subtitle and each word that was not on the slide before it, including a label it changes. The first slide adds all its words. Words inside a screenshot do not count.

Before you embed the video, check the rendered file. Look at one frame from each slide at chat size, and check that its subtitle is readable and covers nothing. Measure each hold by matching the file's frames to the slide, not with a still-frame detector, which counts the faint ends of a fade as still. Count the words each slide adds against its measured hold. Fix any slide you cannot read in that time, render again, and check again.
