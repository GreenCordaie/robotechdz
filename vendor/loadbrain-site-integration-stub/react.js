"use strict";
// Stub minimal pour @loadbrain/site-integration/react — exporte un composant
// no-op ProductManager pour satisfaire les dynamic imports du repo.
const React = require("react");

function ProductManager(_props) {
    return React.createElement(
        "div",
        { style: { padding: "1rem", color: "#9ca3af", fontStyle: "italic" } },
        "[LoadBrain ProductManager — stub UI, real module not loaded in CI]"
    );
}

module.exports = { ProductManager, default: ProductManager };
module.exports.default = ProductManager;
