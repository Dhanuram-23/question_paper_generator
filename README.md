# Question Paper Generator (v7)

Run locally (inside THIS folder):
    python3 -m http.server 8000      ->  open http://localhost:8000

Check: the footer must show "Version v7". In Terminal every line should be 200 or 304 – a 404 means a file is missing.

Folder layout
    index.html, css/, js/ (8 files)      the website
    data/subjects.json                   classes, subjects, units, weightage
    data/10/social.json                  Social question bank (657 questions, from the v5 update)
    tools/                               textbook extractor + Excel -> JSON (from the v5 update)

Update questions:  python3 tools/excel_to_json.py
Publish:           git add . && git commit -m "update" && git push   (GitHub: Settings -> Pages -> Source: GitHub Actions)

New in v7 – Page & text settings (button above the paper)
    Paper size (A4, Letter, Legal, A3, A5, B5), portrait / landscape, 1 or 2 columns, margins, page numbers
    Font, sizes (questions, school name, exam name, part headings), colour, bold options
    Alignment (header, Part titles, part headings, question text left/justify), line spacing, gaps,
    MCQ options per line, map places per line, line under header
    Applies to the screen, the PDF and the Word file. Remembered in this browser.
    On the paper: ▲▼ move a question, "+ Add my own question" adds a blank one.
