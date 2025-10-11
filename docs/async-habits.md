# Async Habits Timeline Behavior

Async habits occupy their own column on the day timeline while sharing the original timeslot of the habit or project they overlap with. The layout engine works in three stages:

## 1. Collect pairing candidates
* All non-async habit placements and project instances for the day are collected as potential partners and sorted by their start time (breaking ties with the end time). This ensures the timeline examines potential slots in chronological order.
* Async habits are filtered from the day's placements, transformed into timestamp pairs, and sorted by their own start (and end) times so the earliest async items claim their partners first.

## 2. Match async habits to partners
* For each async habit, the scheduler scans the sorted candidate list until it either finds an overlap or reaches a candidate that starts after the async habit ends.
* Every overlapping candidate is scored with its actual overlap start, the absolute gap between the two start times, and the overlap duration.
* Matches are ordered to prefer the earliest overlap, then the smallest start gap, then the earliest candidate start, and finally the longest overlap. The first entry in this ordering is chosen so async habits always attach to the earliest viable habit or project that shares their time window.
* Once a match is selected, the async habit is marked as the right-hand card and its partner is marked as the left-hand card. A partner cannot be reused by another async habit.

## 3. Render paired cards
* Paired cards render at half width: the partner keeps the original left offset while the async habit is positioned immediately to its right. Unpaired cards continue to span the full timeline width.
* Async habit cards swap to their amber-tinted background, custom shadow, and warm border accents so they remain visually distinct beside the shared timeslot.

Together these rules let async habits claim a dedicated column without disturbing the chronological flow of the schedule—they simply slide into the earliest overlapping project or habit while both cards share the same vertical timeline span.
