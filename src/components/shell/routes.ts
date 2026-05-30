// canonical list of pages the main window can navigate between. consumed by
// App.tsx and the sidebar so a single source of truth covers the route union.
export type Page = "home" | "insights" | "dictionary" | "settings";
