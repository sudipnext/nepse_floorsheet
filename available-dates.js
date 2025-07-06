// This file lists all available CSV files in the floorsheet folder
// Updated automatically by the Lambda function
const AVAILABLE_DATES = [
    "2025-07-03"
];

// Export for use in script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AVAILABLE_DATES;
} else if (typeof window !== 'undefined') {
    window.AVAILABLE_DATES = AVAILABLE_DATES;
}