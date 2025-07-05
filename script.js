// Configuration
const CONFIG = {
    FLOORSHEET_FOLDER: './floorsheet',
    RECORDS_PER_PAGE: 50
};

// Global variables
let allTransactions = [];
let filteredTransactions = [];
let availableDates = [];
let currentPage = 1;
let sortColumn = '';
let sortDirection = 'asc';
let charts = {};
let currentAnalysisMode = 'single';
let dateRange = { start: null, end: null };

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    try {
        showLoader(true);
        await loadAvailableDates();
        await loadDefaultData();
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application. Please check your configuration.');
    } finally {
        showLoader(false);
    }
}

function setupEventListeners() {
    // Analysis mode selector
    document.getElementById('analysisMode').addEventListener('change', function(e) {
        currentAnalysisMode = e.target.value;
        handleAnalysisModeChange();
    });

    // Date selector (for single day mode)
    document.getElementById('dateSelector').addEventListener('change', function(e) {
        if (currentAnalysisMode === 'single' && e.target.value) {
            loadDataForDateRange([e.target.value]);
        }
    });

    // Custom date range inputs
    document.getElementById('startDate').addEventListener('change', updateCustomDateRange);
    document.getElementById('endDate').addEventListener('change', updateCustomDateRange);

    // Analyze/Refresh button
    document.getElementById('refreshBtn').addEventListener('click', function() {
        handleAnalyzeClick();
    });

    // Search input
    document.getElementById('searchInput').addEventListener('input', function(e) {
        filterTransactions(e.target.value);
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    // Pagination
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));

    // Advanced chart filter controls
    document.getElementById('updateChartsBtn').addEventListener('click', updateAdvancedCharts);
    document.getElementById('symbolFilter').addEventListener('change', updateAdvancedCharts);
    document.getElementById('dateFilter').addEventListener('change', updateAdvancedCharts);
    document.getElementById('brokerFilter').addEventListener('change', updateAdvancedCharts);
}

function handleAnalysisModeChange() {
    const customDateRange = document.getElementById('customDateRange');
    const dateSelector = document.getElementById('dateSelector');
    
    if (currentAnalysisMode === 'custom') {
        customDateRange.classList.remove('hidden');
        dateSelector.style.display = 'none';
    } else {
        customDateRange.classList.add('hidden');
        dateSelector.style.display = 'block';
        
        // Auto-load data based on mode
        if (currentAnalysisMode !== 'single') {
            const dates = getDateRangeForMode(currentAnalysisMode);
            loadDataForDateRange(dates);
        }
    }
}

function getDateRangeForMode(mode) {
    // Only use dates that actually exist in our data
    const sortedDates = [...availableDates].sort((a, b) => new Date(b) - new Date(a));
    
    if (sortedDates.length === 0) {
        console.warn('No available dates found');
        return [];
    }
    
    switch (mode) {
        case 'week':
            // Get last 7 available dates (not necessarily 7 calendar days)
            return sortedDates.slice(0, Math.min(7, sortedDates.length));
        case 'month':
            // Get last 30 available dates or all dates from last 30 calendar days, whichever is smaller
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const monthDates = sortedDates.filter(date => new Date(date) >= thirtyDaysAgo);
            return monthDates.length > 0 ? monthDates : sortedDates.slice(0, Math.min(30, sortedDates.length));
        case 'quarter':
            // Get all dates from last 90 calendar days
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const quarterDates = sortedDates.filter(date => new Date(date) >= ninetyDaysAgo);
            return quarterDates.length > 0 ? quarterDates : sortedDates.slice(0, Math.min(90, sortedDates.length));
        case 'all':
            return sortedDates;
        default:
            return sortedDates.slice(0, 1); // Latest available date
    }
}

function updateCustomDateRange() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (startDate && endDate && currentAnalysisMode === 'custom') {
        // Only include dates that actually exist in our available dates
        const dates = availableDates.filter(date => date >= startDate && date <= endDate)
                                   .sort((a, b) => new Date(b) - new Date(a));
        
        if (dates.length === 0) {
            showError(`No data files found for the date range ${formatDate(startDate)} to ${formatDate(endDate)}`);
            return;
        }
        
        console.log(`Custom range: Found ${dates.length} dates between ${startDate} and ${endDate}`);
        loadDataForDateRange(dates);
    }
}

function handleAnalyzeClick() {
    if (currentAnalysisMode === 'single') {
        const selectedDate = document.getElementById('dateSelector').value;
        if (selectedDate) {
            loadDataForDateRange([selectedDate]);
        } else {
            showError('Please select a date to analyze.');
        }
    } else if (currentAnalysisMode === 'custom') {
        updateCustomDateRange();
    } else {
        const dates = getDateRangeForMode(currentAnalysisMode);
        loadDataForDateRange(dates);
    }
}

async function loadAvailableDates() {
    try {
        availableDates = [];
        
        // Get list of files in the floorsheet folder
        try {
            const response = await fetch(`${CONFIG.FLOORSHEET_FOLDER}/`, {
                method: 'GET',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                const html = await response.text();
                
                // Parse HTML to extract CSV filenames
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const links = doc.querySelectorAll('a');
                
                const csvFiles = [];
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && href.endsWith('.csv')) {
                        // Extract date from filename (assuming format: YYYY-MM-DD.csv)
                        const filename = href.split('/').pop();
                        const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})\.csv$/);
                        if (dateMatch) {
                            csvFiles.push(dateMatch[1]);
                        }
                    }
                });
                
                if (csvFiles.length > 0) {
                    availableDates = [...new Set(csvFiles)].sort((a, b) => new Date(b) - new Date(a));
                    console.log(`Found ${availableDates.length} CSV files in floorsheet folder`);
                } else {
                    console.log('No CSV files found in directory listing, falling back to discovery method');
                    throw new Error('No CSV files in directory listing');
                }
            } else {
                throw new Error('Directory listing not available');
            }
        } catch (error) {
            console.log('Directory listing failed, trying discovery method:', error.message);
            
            // Fallback: try to discover available files by testing recent dates
            const today = new Date();
            const potentialDates = [];
            
            // Generate potential dates for the last 90 days
            for (let i = 0; i < 90; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                potentialDates.push(dateStr);
            }
            
            // Test which CSV files actually exist using HEAD requests
            const testPromises = potentialDates.map(async (date) => {
                try {
                    const response = await fetch(`${CONFIG.FLOORSHEET_FOLDER}/${date}.csv`, { 
                        method: 'HEAD',
                        cache: 'no-cache'
                    });
                    return response.ok ? date : null;
                } catch (error) {
                    return null;
                }
            });
            
            const results = await Promise.all(testPromises);
            availableDates = results.filter(date => date !== null)
                                   .sort((a, b) => new Date(b) - new Date(a));
            
            console.log(`Discovered ${availableDates.length} available date files through testing`);
        }

        if (availableDates.length === 0) {
            showError('No floorsheet data files found. Please check if the floorsheet folder contains CSV files with date names (YYYY-MM-DD.csv).');
            return;
        }

        // Populate date selector dropdown
        const dateSelector = document.getElementById('dateSelector');
        dateSelector.innerHTML = '<option value="">Select Date</option>';
        
        availableDates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = formatDate(date);
            dateSelector.appendChild(option);
        });

        // Set default date range for custom inputs based on actual available dates
        const latestDate = availableDates[0];
        const oldestDate = availableDates[availableDates.length - 1];
        
        document.getElementById('startDate').value = oldestDate;
        document.getElementById('endDate').value = latestDate;
        document.getElementById('startDate').min = oldestDate;
        document.getElementById('startDate').max = latestDate;
        document.getElementById('endDate').min = oldestDate;
        document.getElementById('endDate').max = latestDate;
        
        // Select the latest date by default
        dateSelector.value = latestDate;
        
        console.log(`Date range: ${oldestDate} to ${latestDate}`);
        
    } catch (error) {
        console.error('Error loading available dates:', error);
        showError('Failed to load available dates. Please check the data folder.');
    }
}

async function loadDefaultData() {
    if (availableDates.length > 0) {
        await loadDataForDateRange([availableDates[0]]);
    }
}

async function loadDataForDateRange(dates) {
    try {
        showLoader(true);
        allTransactions = [];
        
        if (!dates || dates.length === 0) {
            showError('No dates specified for data loading.');
            return;
        }
        
        console.log(`Loading data for ${dates.length} dates:`, dates);
        
        let successfulLoads = 0;
        let failedLoads = 0;
        
        // Load data for all specified dates
        for (const date of dates) {
            const csvUrl = `${CONFIG.FLOORSHEET_FOLDER}/${date}.csv`;
            
            try {
                const response = await fetch(csvUrl, { cache: 'no-cache' });
                if (response.ok) {
                    const csvText = await response.text();
                    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
                    
                    if (parsed.errors.length > 0) {
                        console.warn(`CSV parsing errors for ${date}:`, parsed.errors);
                    }

                    const dayTransactions = parsed.data.map((row, index) => {
                        const columns = Object.values(row);
                        
                        return {
                            id: `${date}_${index}`,
                            date: date, // Use the date from filename for consistency
                            sn: row['S.N.'] || columns[1] || '',
                            transaction_no: row['Transaction No.'] || columns[2] || '',
                            symbol: row.Symbol || columns[3] || '',
                            buyer: row.Buyer || columns[4] || '',
                            seller: row.Seller || columns[5] || '',
                            quantity: parseFloat((row.Quantity || columns[6] || '0').toString().replace(/,/g, '')),
                            rate: parseFloat((row.Rate || columns[7] || '0').toString().replace(/,/g, '')),
                            amount: parseFloat((row.Amount || columns[8] || '0').toString().replace(/,/g, ''))
                        };
                    }).filter(t => t.symbol && t.transaction_no);

                    allTransactions.push(...dayTransactions);
                    successfulLoads++;
                    console.log(`✓ Loaded ${dayTransactions.length} transactions for ${date}`);
                } else {
                    console.warn(`✗ Failed to load ${date}: HTTP ${response.status}`);
                    failedLoads++;
                }
            } catch (error) {
                console.warn(`✗ Failed to load data for ${date}:`, error);
                failedLoads++;
            }
        }

        if (allTransactions.length === 0) {
            showError(`No transaction data found for the selected date range. ${failedLoads} files failed to load.`);
            return;
        }

        // Sort transactions by date and then by transaction number
        allTransactions.sort((a, b) => {
            const dateCompare = new Date(b.date) - new Date(a.date);
            return dateCompare !== 0 ? dateCompare : 
                   (parseInt(b.transaction_no) || 0) - (parseInt(a.transaction_no) || 0);
        });

        filteredTransactions = [...allTransactions];
        
        console.log(`📊 Successfully loaded ${allTransactions.length} total transactions from ${successfulLoads}/${dates.length} files`);
        if (failedLoads > 0) {
            console.warn(`⚠️  ${failedLoads} files failed to load`);
        }
        
        // Update date range info
        updateDateRangeInfo(dates.filter(date => 
            allTransactions.some(t => t.date === date)
        ));
        
        // Update all components
        updateSummaryCards();
        updateCharts();
        updateBrokerTables();
        updateTradingRelationships();
        updateSymbolPerformance();
        updateTransactionsTable();
        
        // Update filter dropdowns and advanced charts
        populateFilterDropdowns();
        updateAdvancedCharts();
        
        // Update last updated info
        updateLastUpdated(dates[0]);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data for the selected date range.');
    } finally {
        showLoader(false);
    }
}

function updateDateRangeInfo(dates) {
    const startDate = dates[dates.length - 1]; // Oldest date
    const endDate = dates[0]; // Newest date
    
    if (dates.length === 1) {
        document.getElementById('dateRange').textContent = formatDate(startDate);
        document.getElementById('daysCount').textContent = 'Single Day';
    } else {
        document.getElementById('dateRange').textContent = `${formatDate(startDate)} - ${formatDate(endDate)}`;
        document.getElementById('daysCount').textContent = `${dates.length} days`;
    }
}

function updateSummaryCards() {
    const totalTransactions = filteredTransactions.length;
    const totalVolume = filteredTransactions.reduce((sum, t) => sum + t.quantity, 0);
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);
    const avgPrice = totalVolume > 0 ? totalAmount / totalVolume : 0;

    document.getElementById('totalTransactions').textContent = totalTransactions.toLocaleString();
    document.getElementById('totalVolume').textContent = totalVolume.toLocaleString();
    document.getElementById('totalAmount').textContent = `Rs. ${totalAmount.toLocaleString()}`;
    document.getElementById('avgPrice').textContent = `Rs. ${avgPrice.toFixed(2)}`;

    // Calculate trends if we have multi-day data
    if (currentAnalysisMode !== 'single') {
        updateTrendIndicators();
    } else {
        // Clear trend indicators for single day
        document.getElementById('transactionsTrend').textContent = '-';
        document.getElementById('volumeTrend').textContent = '-';
        document.getElementById('amountTrend').textContent = '-';
        document.getElementById('priceTrend').textContent = '-';
    }
}

function updateTrendIndicators() {
    // Group transactions by date for trend analysis
    const dailyStats = {};
    
    filteredTransactions.forEach(t => {
        if (!dailyStats[t.date]) {
            dailyStats[t.date] = {
                transactions: 0,
                volume: 0,
                amount: 0
            };
        }
        dailyStats[t.date].transactions++;
        dailyStats[t.date].volume += t.quantity;
        dailyStats[t.date].amount += t.amount;
    });

    const dates = Object.keys(dailyStats).sort();
    if (dates.length >= 2) {
        const latest = dailyStats[dates[dates.length - 1]];
        const previous = dailyStats[dates[dates.length - 2]];

        // Calculate percentage changes
        const transactionChange = ((latest.transactions - previous.transactions) / previous.transactions * 100).toFixed(1);
        const volumeChange = ((latest.volume - previous.volume) / previous.volume * 100).toFixed(1);
        const amountChange = ((latest.amount - previous.amount) / previous.amount * 100).toFixed(1);
        const avgPriceChange = (((latest.amount / latest.volume) - (previous.amount / previous.volume)) / (previous.amount / previous.volume) * 100).toFixed(1);

        document.getElementById('transactionsTrend').textContent = `${transactionChange > 0 ? '+' : ''}${transactionChange}%`;
        document.getElementById('volumeTrend').textContent = `${volumeChange > 0 ? '+' : ''}${volumeChange}%`;
        document.getElementById('amountTrend').textContent = `${amountChange > 0 ? '+' : ''}${amountChange}%`;
        document.getElementById('priceTrend').textContent = `${avgPriceChange > 0 ? '+' : ''}${avgPriceChange}%`;

        // Add color classes based on trend
        updateTrendColors('transactionsTrend', transactionChange);
        updateTrendColors('volumeTrend', volumeChange);
        updateTrendColors('amountTrend', amountChange);
        updateTrendColors('priceTrend', avgPriceChange);
    }
}

function updateTrendColors(elementId, change) {
    const element = document.getElementById(elementId);
    element.className = 'text-xs mt-1';
    if (change > 0) {
        element.classList.add('text-green-600');
    } else if (change < 0) {
        element.classList.add('text-red-600');
    } else {
        element.classList.add('text-gray-400');
    }
}

function updateCharts() {
    updateTrendChart();
    updateVolumeTrendChart();
    updateVolumeChart();
    updateAmountChart();
    updateAvgPriceChart();
}

// New function to populate filter dropdowns
function populateFilterDropdowns() {
    // Get unique symbols, dates, and brokers
    const symbols = [...new Set(allTransactions.map(t => t.symbol))].sort();
    const dates = [...new Set(allTransactions.map(t => t.date))].sort((a, b) => new Date(b) - new Date(a));
    const brokers = [...new Set([
        ...allTransactions.map(t => t.buyer),
        ...allTransactions.map(t => t.seller)
    ])].sort();

    // Populate symbol filter
    const symbolFilter = document.getElementById('symbolFilter');
    symbolFilter.innerHTML = '<option value="">All Symbols</option>';
    symbols.forEach(symbol => {
        const option = document.createElement('option');
        option.value = symbol;
        option.textContent = symbol;
        symbolFilter.appendChild(option);
    });

    // Populate date filter
    const dateFilter = document.getElementById('dateFilter');
    dateFilter.innerHTML = '<option value="">All Dates</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        dateFilter.appendChild(option);
    });

    // Populate broker filter
    const brokerFilter = document.getElementById('brokerFilter');
    brokerFilter.innerHTML = '<option value="">All Brokers</option>';
    brokers.forEach(broker => {
        const option = document.createElement('option');
        option.value = broker;
        option.textContent = broker;
        brokerFilter.appendChild(option);
    });
}

// New function to update advanced charts
function updateAdvancedCharts() {
    updatePriceTimeChart();
    updateBrokerVolumeChart();
    updateBrokerShareChart();
    updateQuantityPriceChart();
}

// Line Chart: Average Trade Price Over Time
function updatePriceTimeChart() {
    const selectedSymbol = document.getElementById('symbolFilter').value;
    
    // Filter transactions by symbol if selected
    const transactions = selectedSymbol 
        ? allTransactions.filter(t => t.symbol === selectedSymbol)
        : allTransactions;

    // Group by date and calculate average price
    const dailyPrices = {};
    transactions.forEach(t => {
        if (!dailyPrices[t.date]) {
            dailyPrices[t.date] = { totalAmount: 0, totalQuantity: 0 };
        }
        dailyPrices[t.date].totalAmount += t.amount;
        dailyPrices[t.date].totalQuantity += t.quantity;
    });

    const sortedDates = Object.keys(dailyPrices).sort();
    const avgPrices = sortedDates.map(date => {
        const data = dailyPrices[date];
        return data.totalQuantity > 0 ? data.totalAmount / data.totalQuantity : 0;
    });

    const ctx = document.getElementById('priceTimeChart').getContext('2d');
    
    if (charts.priceTime) {
        charts.priceTime.destroy();
    }

    charts.priceTime = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(date => formatDate(date)),
            datasets: [{
                label: `Average Price ${selectedSymbol ? `(${selectedSymbol})` : '(All Symbols)'}`,
                data: avgPrices,
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Average Trade Price Over Time ${selectedSymbol ? `- ${selectedSymbol}` : ''}`
                },
                legend: {
                    display: true
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Average Price (Rs.)'
                    },
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return 'Rs. ' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// Bar Chart: Broker Trading Volume for Selected Date
function updateBrokerVolumeChart() {
    const selectedDate = document.getElementById('dateFilter').value;
    
    if (!selectedDate) {
        // If no date selected, show message
        const ctx = document.getElementById('brokerVolumeChart').getContext('2d');
        if (charts.brokerVolume) {
            charts.brokerVolume.destroy();
        }
        
        charts.brokerVolume = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Date Selected'],
                datasets: [{
                    label: 'Please select a date',
                    data: [0],
                    backgroundColor: 'rgba(156, 163, 175, 0.5)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Please select a date to view broker trading volume'
                    }
                }
            }
        });
        return;
    }

    // Filter transactions by date
    const dayTransactions = allTransactions.filter(t => t.date === selectedDate);
    
    // Group by buyer (broker) and sum quantities
    const brokerVolumes = {};
    dayTransactions.forEach(t => {
        brokerVolumes[t.buyer] = (brokerVolumes[t.buyer] || 0) + t.quantity;
    });

    // Sort by volume and get top 15
    const sortedBrokers = Object.entries(brokerVolumes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 15);

    const ctx = document.getElementById('brokerVolumeChart').getContext('2d');
    
    if (charts.brokerVolume) {
        charts.brokerVolume.destroy();
    }

    charts.brokerVolume = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedBrokers.map(([broker]) => broker),
            datasets: [{
                label: 'Trading Volume',
                data: sortedBrokers.map(([, volume]) => volume),
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Broker Trading Volume - ${formatDate(selectedDate)}`
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Broker (Buyer)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Volume (Quantity)'
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// Pie Chart: Broker Share by Amount for Selected Symbol and Date
function updateBrokerShareChart() {
    const selectedSymbol = document.getElementById('symbolFilter').value;
    const selectedDate = document.getElementById('dateFilter').value;
    
    if (!selectedSymbol || !selectedDate) {
        // Show message if symbol or date not selected
        const ctx = document.getElementById('brokerShareChart').getContext('2d');
        if (charts.brokerShare) {
            charts.brokerShare.destroy();
        }
        
        charts.brokerShare = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['No Selection'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(156, 163, 175, 0.5)']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Please select both symbol and date'
                    }
                }
            }
        });
        return;
    }

    // Filter transactions by symbol and date
    const filteredTransactions = allTransactions.filter(t => 
        t.symbol === selectedSymbol && t.date === selectedDate
    );

    if (filteredTransactions.length === 0) {
        const ctx = document.getElementById('brokerShareChart').getContext('2d');
        if (charts.brokerShare) {
            charts.brokerShare.destroy();
        }
        
        charts.brokerShare = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(156, 163, 175, 0.5)']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `No transactions found for ${selectedSymbol} on ${formatDate(selectedDate)}`
                    }
                }
            }
        });
        return;
    }

    // Group by buyer and sum amounts
    const brokerAmounts = {};
    filteredTransactions.forEach(t => {
        brokerAmounts[t.buyer] = (brokerAmounts[t.buyer] || 0) + t.amount;
    });

    const sortedBrokers = Object.entries(brokerAmounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); // Top 10 brokers

    const colors = [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(6, 182, 212, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(168, 85, 247, 0.8)'
    ];

    const ctx = document.getElementById('brokerShareChart').getContext('2d');
    
    if (charts.brokerShare) {
        charts.brokerShare.destroy();
    }

    charts.brokerShare = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sortedBrokers.map(([broker]) => broker),
            datasets: [{
                data: sortedBrokers.map(([, amount]) => amount),
                backgroundColor: colors.slice(0, sortedBrokers.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Broker Share by Amount - ${selectedSymbol} (${formatDate(selectedDate)})`
                },
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: Rs. ${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Scatter Plot: Quantity vs Price for Selected Date
function updateQuantityPriceChart() {
    const selectedDate = document.getElementById('dateFilter').value;
    
    if (!selectedDate) {
        // Show message if no date selected
        const ctx = document.getElementById('quantityPriceChart').getContext('2d');
        if (charts.quantityPrice) {
            charts.quantityPrice.destroy();
        }
        
        charts.quantityPrice = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Please select a date',
                    data: [],
                    backgroundColor: 'rgba(156, 163, 175, 0.5)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Please select a date to view quantity vs price relationship'
                    }
                }
            }
        });
        return;
    }

    // Filter transactions by date
    const dayTransactions = allTransactions.filter(t => t.date === selectedDate);
    
    // Create scatter plot data
    const scatterData = dayTransactions.map(t => ({
        x: t.quantity,
        y: t.rate,
        symbol: t.symbol
    }));

    const ctx = document.getElementById('quantityPriceChart').getContext('2d');
    
    if (charts.quantityPrice) {
        charts.quantityPrice.destroy();
    }

    charts.quantityPrice = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Transactions',
                data: scatterData,
                backgroundColor: 'rgba(139, 92, 246, 0.6)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Quantity vs Price Relationship - ${formatDate(selectedDate)}`
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.parsed;
                            const transaction = scatterData[context.dataIndex];
                            return [
                                `Symbol: ${transaction.symbol}`,
                                `Quantity: ${point.x.toLocaleString()}`,
                                `Price: Rs. ${point.y.toFixed(2)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Quantity'
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Price (Rs.)'
                    },
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return 'Rs. ' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

function updateVolumeChart() {
    const symbolVolume = {};
    filteredTransactions.forEach(t => {
        symbolVolume[t.symbol] = (symbolVolume[t.symbol] || 0) + t.quantity;
    });

    const sortedSymbols = Object.entries(symbolVolume)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const ctx = document.getElementById('volumeChart').getContext('2d');
    
    if (charts.volume) {
        charts.volume.destroy();
    }

    charts.volume = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedSymbols.map(([symbol]) => symbol),
            datasets: [{
                label: 'Volume',
                data: sortedSymbols.map(([, volume]) => volume),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateAmountChart() {
    const symbolAmount = {};
    filteredTransactions.forEach(t => {
        symbolAmount[t.symbol] = (symbolAmount[t.symbol] || 0) + t.amount;
    });

    const sortedSymbols = Object.entries(symbolAmount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const ctx = document.getElementById('amountChart').getContext('2d');
    
    if (charts.amount) {
        charts.amount.destroy();
    }

    charts.amount = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sortedSymbols.map(([symbol]) => symbol),
            datasets: [{
                data: sortedSymbols.map(([, amount]) => amount),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(6, 182, 212, 0.8)',
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(251, 146, 60, 0.8)',
                    'rgba(168, 85, 247, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: Rs. ${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateHourlyChart() {
    // Since we don't have time data in the CSV, we'll create a mock hourly distribution
    // based on typical trading patterns (this is just for demonstration)
    const hours = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00'];
    const transactionCounts = hours.map(() => Math.floor(Math.random() * filteredTransactions.length / 5));

    const ctx = document.getElementById('hourlyChart').getContext('2d');
    
    if (charts.hourly) {
        charts.hourly.destroy();
    }

    charts.hourly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: 'Transactions',
                data: transactionCounts,
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateBrokerTables() {
    updateTopBrokers('buyer', 'topBuyersTable');
    updateTopBrokers('seller', 'topSellersTable');
}

function updateTopBrokers(type, tableId) {
    const brokerStats = {};
    
    filteredTransactions.forEach(t => {
        const broker = t[type];
        if (!brokerStats[broker]) {
            brokerStats[broker] = {
                transactions: 0,
                volume: 0,
                amount: 0
            };
        }
        brokerStats[broker].transactions++;
        brokerStats[broker].volume += t.quantity;
        brokerStats[broker].amount += t.amount;
    });

    const sortedBrokers = Object.entries(brokerStats)
        .sort(([,a], [,b]) => b.amount - a.amount)
        .slice(0, 10);

    const tbody = document.getElementById(tableId);
    tbody.innerHTML = '';

    sortedBrokers.forEach(([broker, stats]) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${broker}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${stats.transactions.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${stats.volume.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${stats.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    const startIndex = (currentPage - 1) * CONFIG.RECORDS_PER_PAGE;
    const endIndex = Math.min(startIndex + CONFIG.RECORDS_PER_PAGE, filteredTransactions.length);
    const pageData = filteredTransactions.slice(startIndex, endIndex);

    tbody.innerHTML = '';

    pageData.forEach(transaction => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${transaction.sn}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${transaction.transaction_no}</td>
            <td class="px-4 py-3 text-sm font-medium text-blue-600">${transaction.symbol}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${transaction.buyer}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${transaction.seller}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${transaction.quantity.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${transaction.rate.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${transaction.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    updatePaginationInfo();
}

function updatePaginationInfo() {
    const totalRecords = filteredTransactions.length;
    const totalPages = Math.ceil(totalRecords / CONFIG.RECORDS_PER_PAGE);
    const startRecord = (currentPage - 1) * CONFIG.RECORDS_PER_PAGE + 1;
    const endRecord = Math.min(currentPage * CONFIG.RECORDS_PER_PAGE, totalRecords);

    document.getElementById('startRecord').textContent = totalRecords > 0 ? startRecord : 0;
    document.getElementById('endRecord').textContent = endRecord;
    document.getElementById('totalRecords').textContent = totalRecords;
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;

    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages || totalPages === 0;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredTransactions.length / CONFIG.RECORDS_PER_PAGE);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        updateTransactionsTable();
    }
}

function filterTransactions(searchTerm) {
    if (!searchTerm.trim()) {
        filteredTransactions = [...allTransactions];
    } else {
        const term = searchTerm.toLowerCase();
        filteredTransactions = allTransactions.filter(t => 
            t.symbol.toLowerCase().includes(term) ||
            t.buyer.toLowerCase().includes(term) ||
            t.seller.toLowerCase().includes(term) ||
            t.transaction_no.toLowerCase().includes(term)
        );
    }
    
    currentPage = 1;
    updateSummaryCards();
    updateCharts();
    updateBrokerTables();
    updateTransactionsTable();
    updateAdvancedCharts();
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    filteredTransactions.sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];

        if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }

        if (sortDirection === 'asc') {
            return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
            return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
    });

    updateTransactionsTable();
}

function exportToCSV() {
    const headers = ['Date', 'S.N.', 'Transaction No.', 'Symbol', 'Buyer', 'Seller', 'Quantity', 'Rate', 'Amount'];
    const csvContent = [
        headers.join(','),
        ...filteredTransactions.map(t => [
            t.date,
            t.sn,
            t.transaction_no,
            t.symbol,
            t.buyer,
            t.seller,
            t.quantity,
            t.rate,
            t.amount
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floorsheet_${document.getElementById('dateSelector').value || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function showLoader(show) {
    const loader = document.getElementById('loadingSpinner');
    loader.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    // Create a simple error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        document.body.removeChild(errorDiv);
    }, 5000);
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

function updateLastUpdated(date) {
    document.getElementById('lastUpdated').textContent = formatDate(date);
}

function updateTrendChart() {
    // Group data by date for trend analysis
    const dailyStats = {};
    
    filteredTransactions.forEach(t => {
        if (!dailyStats[t.date]) {
            dailyStats[t.date] = {
                totalAmount: 0,
                totalVolume: 0,
                avgPrice: 0,
                transactionCount: 0
            };
        }
        dailyStats[t.date].totalAmount += t.amount;
        dailyStats[t.date].totalVolume += t.quantity;
        dailyStats[t.date].transactionCount++;
    });

    // Calculate average price for each day
    Object.keys(dailyStats).forEach(date => {
        const stats = dailyStats[date];
        stats.avgPrice = stats.totalVolume > 0 ? stats.totalAmount / stats.totalVolume : 0;
    });

    const sortedDates = Object.keys(dailyStats).sort();
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (charts.trend) {
        charts.trend.destroy();
    }

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(date => formatDate(date)),
            datasets: [{
                label: 'Average Price (Rs.)',
                data: sortedDates.map(date => dailyStats[date].avgPrice),
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'Transaction Count',
                data: sortedDates.map(date => dailyStats[date].transactionCount),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: false,
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Average Price (Rs.)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Transaction Count'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });
}

function updateVolumeTrendChart() {
    // Group data by date for volume trend analysis
    const dailyVolume = {};
    
    filteredTransactions.forEach(t => {
        if (!dailyVolume[t.date]) {
            dailyVolume[t.date] = 0;
        }
        dailyVolume[t.date] += t.quantity;
    });

    const sortedDates = Object.keys(dailyVolume).sort();
    const ctx = document.getElementById('volumeTrendChart').getContext('2d');
    
    if (charts.volumeTrend) {
        charts.volumeTrend.destroy();
    }

    charts.volumeTrend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates.map(date => formatDate(date)),
            datasets: [{
                label: 'Daily Volume',
                data: sortedDates.map(date => dailyVolume[date]),
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Volume'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateAvgPriceChart() {
    // Calculate average price per symbol
    const symbolStats = {};
    
    filteredTransactions.forEach(t => {
        if (!symbolStats[t.symbol]) {
            symbolStats[t.symbol] = {
                totalAmount: 0,
                totalVolume: 0,
                transactions: 0
            };
        }
        symbolStats[t.symbol].totalAmount += t.amount;
        symbolStats[t.symbol].totalVolume += t.quantity;
        symbolStats[t.symbol].transactions++;
    });

    // Calculate average price and filter symbols with significant trading
    const symbolAvgPrices = Object.entries(symbolStats)
        .map(([symbol, stats]) => ({
            symbol,
            avgPrice: stats.totalVolume > 0 ? stats.totalAmount / stats.totalVolume : 0,
            transactions: stats.transactions
        }))
        .filter(item => item.transactions >= 5) // Only symbols with 5+ transactions
        .sort((a, b) => b.avgPrice - a.avgPrice)
        .slice(0, 10);

    const ctx = document.getElementById('avgPriceChart').getContext('2d');
    
    if (charts.avgPrice) {
        charts.avgPrice.destroy();
    }

    charts.avgPrice = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: symbolAvgPrices.map(item => item.symbol),
            datasets: [{
                label: 'Average Price (Rs.)',
                data: symbolAvgPrices.map(item => item.avgPrice),
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Price (Rs.)'
                    },
                    ticks: {
                        callback: function(value) {
                            return 'Rs. ' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateTradingRelationships() {
    const relationships = {};
    
    filteredTransactions.forEach(t => {
        const key = `${t.buyer} → ${t.seller}`;
        if (!relationships[key]) {
            relationships[key] = {
                trades: 0,
                totalAmount: 0,
                totalVolume: 0,
                buyer: t.buyer,
                seller: t.seller
            };
        }
        relationships[key].trades++;
        relationships[key].totalAmount += t.amount;
        relationships[key].totalVolume += t.quantity;
    });

    // Sort by total amount and get top 15
    const sortedRelationships = Object.entries(relationships)
        .map(([key, stats]) => ({
            ...stats,
            key,
            avgPrice: stats.totalVolume > 0 ? stats.totalAmount / stats.totalVolume : 0
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 15);

    const tbody = document.getElementById('tradingRelationshipsTable');
    tbody.innerHTML = '';

    sortedRelationships.forEach(relationship => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-900">${relationship.key}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${relationship.trades.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${relationship.avgPrice.toFixed(2)}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${relationship.totalAmount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateSymbolPerformance() {
    const symbolStats = {};
    
    filteredTransactions.forEach(t => {
        if (!symbolStats[t.symbol]) {
            symbolStats[t.symbol] = {
                trades: 0,
                totalAmount: 0,
                totalVolume: 0,
                prices: [],
                dates: []
            };
        }
        symbolStats[t.symbol].trades++;
        symbolStats[t.symbol].totalAmount += t.amount;
        symbolStats[t.symbol].totalVolume += t.quantity;
        symbolStats[t.symbol].prices.push(t.rate);
        symbolStats[t.symbol].dates.push(t.date);
    });

    // Calculate performance metrics for each symbol
    const symbolPerformance = Object.entries(symbolStats)
        .map(([symbol, stats]) => {
            const avgPrice = stats.totalVolume > 0 ? stats.totalAmount / stats.totalVolume : 0;
            
            // Calculate price trend (if we have multiple dates)
            const uniqueDates = [...new Set(stats.dates)].sort();
            let priceTrend = 'Stable';
            
            if (uniqueDates.length > 1) {
                // Get transactions for first and last dates
                const firstDateTransactions = filteredTransactions.filter(t => 
                    t.symbol === symbol && t.date === uniqueDates[0]
                );
                const lastDateTransactions = filteredTransactions.filter(t => 
                    t.symbol === symbol && t.date === uniqueDates[uniqueDates.length - 1]
                );
                
                if (firstDateTransactions.length > 0 && lastDateTransactions.length > 0) {
                    const firstAvg = firstDateTransactions.reduce((sum, t) => sum + t.rate, 0) / firstDateTransactions.length;
                    const lastAvg = lastDateTransactions.reduce((sum, t) => sum + t.rate, 0) / lastDateTransactions.length;
                    const change = ((lastAvg - firstAvg) / firstAvg) * 100;
                    
                    if (change > 2) priceTrend = `↗ +${change.toFixed(1)}%`;
                    else if (change < -2) priceTrend = `↘ ${change.toFixed(1)}%`;
                    else priceTrend = `→ ${change.toFixed(1)}%`;
                }
            }
            
            return {
                symbol,
                trades: stats.trades,
                avgPrice,
                priceTrend,
                totalAmount: stats.totalAmount
            };
        })
        .filter(item => item.trades >= 3) // Only symbols with 3+ transactions
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 20);

    const tbody = document.getElementById('symbolPerformanceTable');
    tbody.innerHTML = '';

    symbolPerformance.forEach(symbol => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        // Add color coding for price trends
        let trendClass = 'text-gray-600';
        if (symbol.priceTrend.includes('↗')) trendClass = 'text-green-600';
        else if (symbol.priceTrend.includes('↘')) trendClass = 'text-red-600';
        
        row.innerHTML = `
            <td class="px-4 py-3 text-sm font-medium text-blue-600">${symbol.symbol}</td>
            <td class="px-4 py-3 text-sm text-gray-900">${symbol.trades.toLocaleString()}</td>
            <td class="px-4 py-3 text-sm text-gray-900">Rs. ${symbol.avgPrice.toFixed(2)}</td>
            <td class="px-4 py-3 text-sm font-medium ${trendClass}">${symbol.priceTrend}</td>
        `;
        tbody.appendChild(row);
    });
}
