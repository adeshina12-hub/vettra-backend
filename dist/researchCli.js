import { runResearch } from "./research/runResearch.js";
const query = process.argv.slice(2).join(" ");
if (!query) {
    console.error('Usage: npm run research -- "<project name or ticker>"');
    process.exit(1);
}
runResearch(query)
    .then((report) => {
    console.log("\n=== REPORT ===\n");
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
})
    .catch((err) => {
    console.error("Research run failed:", err);
    process.exit(1);
});
