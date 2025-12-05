/**
 * Generate random sample CSV data for demonstration
 */

export interface SampleDataset {
    name: string;
    description: string;
    headers: string[];
    rows: string[][];
}

const SALES_REGIONS = ["North", "South", "East", "West", "Central"];
const PRODUCTS = ["Laptop", "Phone", "Tablet", "Monitor", "Keyboard", "Mouse", "Headphones"];
const CATEGORIES = ["Electronics", "Accessories", "Software", "Services"];

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomDate(year: number): string {
    const month = randomInt(1, 12);
    const day = randomInt(1, 28);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function generateSalesDataset(): SampleDataset {
    const headers = ["Date", "Region", "Product", "Category", "Quantity", "UnitPrice", "Revenue"];
    const rows: string[][] = [];

    for (let i = 0; i < 100; i++) {
        const quantity = randomInt(1, 50);
        const unitPrice = randomInt(50, 2000);
        const revenue = quantity * unitPrice;

        rows.push([
            randomDate(2024),
            randomChoice(SALES_REGIONS),
            randomChoice(PRODUCTS),
            randomChoice(CATEGORIES),
            String(quantity),
            String(unitPrice),
            String(revenue),
        ]);
    }

    return {
        name: "Sales Data 2024",
        description: "Sample sales transactions with products, regions, and revenue",
        headers,
        rows,
    };
}

export function generateEmployeeDataset(): SampleDataset {
    const headers = ["EmployeeID", "Department", "Salary", "YearsExperience", "PerformanceScore", "Remote"];
    const departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"];
    const rows: string[][] = [];

    for (let i = 0; i < 80; i++) {
        const yearsExp = randomInt(1, 20);
        const baseSalary = 40000 + yearsExp * 5000 + randomInt(-10000, 10000);

        rows.push([
            `EMP${String(1000 + i).padStart(4, "0")}`,
            randomChoice(departments),
            String(baseSalary),
            String(yearsExp),
            String(randomInt(1, 5)),
            Math.random() > 0.5 ? "Yes" : "No",
        ]);
    }

    return {
        name: "Employee Data",
        description: "Sample employee records with salary, experience, and performance data",
        headers,
        rows,
    };
}

export function generateWebTrafficDataset(): SampleDataset {
    const headers = ["Date", "PageViews", "UniqueVisitors", "BounceRate", "AvgSessionDuration", "Source"];
    const sources = ["Organic", "Direct", "Social", "Referral", "Email", "Paid"];
    const rows: string[][] = [];

    for (let i = 0; i < 90; i++) {
        const pageViews = randomInt(1000, 50000);
        const uniqueVisitors = Math.floor(pageViews * (0.3 + Math.random() * 0.4));

        rows.push([
            randomDate(2024),
            String(pageViews),
            String(uniqueVisitors),
            String((30 + Math.random() * 40).toFixed(1)),
            String(randomInt(60, 300)),
            randomChoice(sources),
        ]);
    }

    return {
        name: "Web Traffic Analytics",
        description: "Sample website analytics with page views, visitors, and traffic sources",
        headers,
        rows,
    };
}

export const SAMPLE_DATASETS = [
    { id: "sales", name: "📊 Sales Data", generator: generateSalesDataset },
    { id: "employees", name: "👥 Employee Data", generator: generateEmployeeDataset },
    { id: "traffic", name: "🌐 Web Traffic", generator: generateWebTrafficDataset },
] as const;

export function generateDatasetById(id: string): SampleDataset | null {
    const dataset = SAMPLE_DATASETS.find(d => d.id === id);
    return dataset ? dataset.generator() : null;
}
