import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  fetchFeatureImportance,
  fetchOverview,
  predict as requestPrediction,
} from './api/dashboardApi';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', options).format(value);
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `${(value * 100).toFixed(2)}%`;
}

const Card = ({ title, children }) => (
  <div className="rounded-2xl bg-gray-800/60 shadow-xl ring-1 ring-white/10 divide-y divide-white/5 backdrop-blur">
    <div className="px-6 py-5">
      <h2 className="text-xl font-semibold bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 text-transparent bg-clip-text">
        {title}
      </h2>
    </div>
    <div className="px-6 py-5 text-sm md:text-base">{children}</div>
  </div>
);

const StatRow = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
    <span className="text-sm font-medium text-white/80">{label}</span>
    <span className="text-base font-semibold text-emerald-300">{value}</span>
  </div>
);

const InputField = ({ label, name, value, onChange }) => (
  <label className="block space-y-2">
    <span className="text-sm font-medium text-white/80">{label}</span>
    <input
      type="number"
      min="0"
      step="any"
      required
      name={name}
      value={value}
      onChange={onChange}
      className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
    />
  </label>
);

const featureFields = [
  { name: 'AvgTransactionAmount', label: 'Avg Transaction Amount' },
  { name: 'NumberOfTransactionsPerMonth', label: 'Number of Transactions / Month' },
  { name: 'MaxMonthlySpend', label: 'Max Monthly Spend' },
  { name: 'TotalWeekendSpending', label: 'Total Weekend Spending' },
  { name: 'DaysSinceLastTransaction', label: 'Days Since Last Transaction' },
  { name: 'WeekendSpendingRatio', label: 'Weekend Spending Ratio' },
  { name: 'Age', label: 'Age' },
  { name: 'Income', label: 'Income' },
  { name: 'TotalCASABalance', label: 'Total CASA Balance' },
  { name: 'TotalFixedDepositBalance', label: 'Total Fixed Deposit Balance' },
  { name: 'TotalLoanOrgAmount', label: 'Total Loan Original Amount' },
  { name: 'TotalLoanEMIAmount', label: 'Total Loan EMI Amount' },
  { name: 'AvgLoanToIncomeRatio', label: 'Avg Loan to Income Ratio' },
  { name: 'AvgDebtToIncomeRatio', label: 'Avg Debt to Income Ratio' },
  { name: 'MonthlyCreditUtilizationRate', label: 'Monthly Credit Utilization Rate' },
];

export default function App() {
  const [featureImportance, setFeatureImportance] = useState([]);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [featureError, setFeatureError] = useState('');

  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  const [formData, setFormData] = useState(() =>
    featureFields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [isPredicting, setIsPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [predictError, setPredictError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadFeatureImportance = async () => {
      setFeatureLoading(true);
      try {
        const response = await fetchFeatureImportance();
        if (!isMounted) return;

        const rawFeatures = Array.isArray(response?.features)
          ? response.features
          : Array.isArray(response)
          ? response
          : [];

        const normalized = rawFeatures
          .map((item) => {
            const name = item?.name ?? item?.feature;
            const importanceValue = Number(item?.importance ?? item?.value);

            if (!name || Number.isNaN(importanceValue)) {
              return null;
            }

            return { name, importance: importanceValue };
          })
          .filter(Boolean)
          .sort((a, b) => b.importance - a.importance);

        setFeatureImportance(normalized);
        setFeatureError('');
      } catch (error) {
        if (!isMounted) return;
        setFeatureImportance([]);
        setFeatureError(error?.message || 'Không thể tải dữ liệu feature importance.');
      } finally {
        if (isMounted) {
          setFeatureLoading(false);
        }
      }
    };

    loadFeatureImportance();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      setOverviewLoading(true);
      try {
        const response = await fetchOverview();
        if (!isMounted) return;

        setOverview(response || {});
        setOverviewError('');
      } catch (error) {
        if (!isMounted) return;
        setOverview(null);
        setOverviewError(error?.message || 'Không thể tải dữ liệu tổng quan.');
      } finally {
        if (isMounted) {
          setOverviewLoading(false);
        }
      }
    };

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, []);

  const topThreeFeatures = useMemo(
    () => featureImportance.slice(0, 3),
    [featureImportance]
  );

  const topTenFeatures = useMemo(
    () => featureImportance.slice(0, 10),
    [featureImportance]
  );

  const chartData = useMemo(() => {
    if (!topTenFeatures.length) {
      return null;
    }

    return {
      labels: topTenFeatures.map((feature) => feature.name),
      datasets: [
        {
          label: 'Importance',
          data: topTenFeatures.map((feature) => feature.importance),
        },
      ],
    };
  }, [topTenFeatures]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || 'Importance';
              const value = context.parsed.y;
              return `${label}: ${(value * 100).toFixed(2)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#E5E7EB',
            maxRotation: 45,
            minRotation: 45,
            font: {
              size: 11,
            },
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.15)',
          },
        },
        y: {
          ticks: {
            color: '#E5E7EB',
            callback: (value) => `${(value * 100).toFixed(0)}%`,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
      },
    }),
    []
  );

  const overviewStats = [
    { key: 'total_rows', label: 'Total Rows' },
    { key: 'unique_customers', label: 'Unique Customers' },
    { key: 'months_covered', label: 'Months Covered' },
    {
      key: 'mean_monthly_spending',
      label: 'Mean Monthly Spending',
      options: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
    {
      key: 'avg_txn_per_month',
      label: 'Avg Transactions / Month',
      options: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
  ];

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePredict = async (event) => {
    event.preventDefault();
    setPredictError('');
    setPrediction(null);
    setIsPredicting(true);

    try {
      const payload = Object.fromEntries(
        Object.entries(formData).map(([fieldName, fieldValue]) => {
          const numericValue = Number(fieldValue);
          if (Number.isNaN(numericValue)) {
            throw new Error(`Field "${fieldName}" must be numeric.`);
          }
          return [fieldName, numericValue];
        })
      );

      const response = await requestPrediction(payload);
      const rawValue = response?.prediction ?? response;
      const numericPrediction = Number(rawValue);

      if (Number.isNaN(numericPrediction)) {
        setPredictError('Máy chủ trả về kết quả không hợp lệ.');
      } else {
        setPrediction(numericPrediction);
      }
    } catch (error) {
      setPredictError(error?.message || 'Không thể thực hiện dự đoán.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-10">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.4em] text-emerald-400/70">
            Credit Card Dashboard
          </p>
          <h1 className="text-3xl font-semibold md:text-4xl">
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 bg-clip-text text-transparent">
              Customer Spending Insights
            </span>
          </h1>
          <p className="max-w-2xl text-sm text-white/60 md:text-base">
            Theo dõi các chỉ số quan trọng, hiểu rõ đóng góp của từng đặc trưng và dự báo nhanh chóng chỉ với vài thông số đầu vào.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          <Card title="Top Features">
            {featureLoading && (
              <p className="text-sm text-white/60">Đang tải dữ liệu quan trọng...</p>
            )}
            {featureError && (
              <p className="text-sm text-rose-400">{featureError}</p>
            )}
            {!featureLoading && !featureError && (
              <div className="space-y-4">
                {topThreeFeatures.length ? (
                  <ul className="space-y-3">
                    {topThreeFeatures.map((feature) => (
                      <li
                        key={feature.name}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3"
                      >
                        <span className="text-sm font-medium md:text-base">
                          {feature.name}
                        </span>
                        <span className="text-base font-semibold text-emerald-300">
                          {formatPercent(feature.importance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-white/60">
                    Không có dữ liệu đặc trưng để hiển thị.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Feature Importance Chart">
            {featureLoading && (
              <p className="text-sm text-white/60">Đang tải biểu đồ...</p>
            )}
            {featureError && (
              <p className="text-sm text-rose-400">{featureError}</p>
            )}
            {!featureLoading && !featureError && chartData ? (
              <div className="h-80">
                <Bar data={chartData} options={chartOptions} />
              </div>
            ) : null}
            {!featureLoading && !featureError && !chartData && (
              <p className="text-sm text-white/60">
                Không có đủ dữ liệu để vẽ biểu đồ.
              </p>
            )}
          </Card>

          <Card title="Overview">
            {overviewLoading && (
              <p className="text-sm text-white/60">Đang tải số liệu tổng quan...</p>
            )}
            {overviewError && (
              <p className="text-sm text-rose-400">{overviewError}</p>
            )}
            {!overviewLoading && !overviewError && overview && (
              <div className="space-y-3">
                {overviewStats.map((stat) => (
                  <StatRow
                    key={stat.key}
                    label={stat.label}
                    value={formatNumber(overview?.[stat.key], stat.options)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Quick Predict">
            <form onSubmit={handlePredict} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {featureFields.map((field) => (
                  <InputField
                    key={field.name}
                    label={field.label}
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleInputChange}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-gray-900 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPredicting}
                >
                  {isPredicting ? 'Predicting...' : 'Predict'}
                </button>
                {prediction !== null && (
                  <span className="rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                    Prediction: {formatNumber(prediction, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              {predictError && (
                <p className="text-sm text-rose-400">{predictError}</p>
              )}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
