# Sync Habits Timeline Behavior

Sync habits occupy their own column on the day timeline while sharing the original timeslot of the habit or project they overlap with. The layout engine works in three stages:

## 1. Build daily placements
* Regular habits reserve time sequentially inside each window just like before, but sync habits are placed on a parallel track that always begins at the start of the window (or the beginning of their due range) so they never block other items from using that window.
* After scheduling, all non-sync habit placements and project instances for the day are collected as potential partners and sorted by their start time (breaking ties with the end time). This ensures the timeline examines potential slots in chronological order.
* Sync habits are filtered from the day's placements, transformed into timestamp pairs, and sorted by their own start (and end) times so the earliest sync items claim their partners first.

## 2. Match sync habits to partners
* For each sync habit, the scheduler scans the sorted candidate list until it either finds an overlap or reaches a candidate that starts after the sync habit ends.
* Every overlapping candidate is scored with its actual overlap start, the absolute gap between the two start times, and the overlap duration.
* Matches are ordered to prefer the earliest overlap, then the smallest start gap, then the earliest candidate start, and finally the longest overlap. The first entry in this ordering is chosen so sync habits always attach to the earliest viable habit or project that shares their time window.
* Once a match is selected, the sync habit is marked as the right-hand card and its partner is marked as the left-hand card. A partner cannot be reused by another sync habit.

## 3. Render paired cards
* Paired cards render at half width: the partner keeps the original left offset while the sync habit is positioned immediately to its right. The cards are separated by a hairline gutter so the pair reads as a single combined slot without feeling cramped, and their touching corners lose their rounding so the edges meet cleanly while the outer corners stay soft. Unpaired cards—including sync habits that did not find anything else in their window—continue to span the full timeline width.
* Sync habit cards swap to their amber-tinted background, custom shadow, and warm border accents so they remain visually distinct beside the shared timeslot.

Together these rules let sync habits claim a dedicated column without disturbing the chronological flow of the schedule—they simply slide into the earliest overlapping project or habit while both cards share the same vertical timeline span.
