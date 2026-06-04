---
description: Transform rough ideas into fully-formed designs through structured Socratic questioning, alternative exploration, and incremental validation
---

# Brainstorming Ideas Into Designs

Use this workflow whenever the user wants to refine an idea, plan a new feature, or brainstorm a complex system change in BeanPool.

## Phase 1: Understanding

1. Announce: "I'm using the `/brainstorm` workflow to refine your idea into a concrete design."
2. Analyze the current codebase and project state.
3. Ask **ONE clarifying question at a time** to understand the purpose, constraints, and success criteria.
4. If there are multiple-choice options, present them as structured choices using `AskUserQuestion`.

## Phase 2: Exploration

5. Propose **2-3 distinct approaches** to solve the problem.
6. For each approach, provide:
   - Core Architecture & Data Flow
   - Trade-offs (Pros & Cons)
   - Complexity assessment (Low, Medium, High)
7. Present these choices clearly to the user and ask which approach resonates best.

## Phase 3: Design Presentation

8. Break down the chosen approach and present the design incrementally in **200-300 word sections** (e.g., Database Schema, Server State Engine, Native Client UI).
9. After each section, ask an open-ended question: "Does this look right so far?" or "What are your thoughts on this part?" to validate the design.

## Phase 4: Design Documentation

10. Once the full design is validated, write it to a permanent document in the repository:
    - **Path**: `docs/plans/YYYY-MM-DD-<topic>-design.md` (using today's date and a descriptive topic).
    - Capture the exact design, schema, and API changes agreed upon.
11. Commit the design document to git.

## Phase 5: Handoff to Implementation

12. Ask the user: "Ready to create the implementation plan?"
13. Once confirmed, create the `implementation_plan.md` artifact outlining the specific coding tasks and files to change.
