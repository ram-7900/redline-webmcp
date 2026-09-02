// Pulls the WebMCP global declarations (WebMCP.* namespace and Document.modelContext)
// into the project. The package ships ambient globals, so it needs an explicit
// reference — importing it from a module would not register them.
/// <reference types="webmcp-types" />
