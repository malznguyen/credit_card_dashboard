import React, { useEffect, useMemo, useState } from 'react';
import { fetchMonthlyFeatures } from '../api/dashboardApi';

const currencyFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const integerFormatOptions = {
  maximumFractionDigits: 0,
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('en-US', options).format(numericValue);
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `${(numericValue * 100).toFixed(2)}%`;
}

const columns = [
  { key: 'CustomerID', label: 'CustomerID' },
  { key: 'YearMonth', label: 'YearMonth' },
  {
    key: 'MonthlyTotalSpending',
    label: 'MonthlyTotalSpending',
    format: (value) => formatNumber(value, currencyFormatOptions),
  },
  {
    key: 'NumberOfTransactionsPerMonth',
    label: 'NumberOfTransactionsPerMonth',
    format: (value) => formatNumber(value, integerFormatOptions),
  },
  {
    key: 'AvgTransactionAmount',
    label: 'AvgTransactionAmount',
    format: (value) => formatNumber(value, currencyFormatOptions),
  },
  {
    key: 'WeekendSpendingRatio',
    label: 'WeekendSpendingRatio',
    format: formatPercent,
  },
];

function MonthlyTable({ defaultPageSize = 50 }) {
  const pageSize = useMemo(() => {
    const numeric = Number(defaultPageSize);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 50;
    }

    return Math.min(200, Math.floor(numeric));
  }, [defaultPageSize]);

  const [page, setPage] = useState(1);
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [yearMonthInput, setYearMonthInput] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [yearMonth, setYearMonth] = useState('');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadMonthlyFeatures = async () => {
      setIsLoading(true);

      try {
        const response = await fetchMonthlyFeatures({
          page,
          pageSize,
          customerId: customerId || undefined,
          yearMonth: yearMonth || undefined,
          signal: controller.signal,
        });

        if (!isMounted) {
          return;
        }

        if (response?.total_pages > 0 && page > response.total_pages) {
          setPage(response.total_pages);
          return;
        }

        setData(response);
        setError('');
      } catch (requestError) {
        if (!isMounted || requestError?.name === 'AbortError') {
          return;
        }

        setError(requestError?.message || 'Không thể tải dữ liệu bảng.');
        setData(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMonthlyFeatures();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [page, pageSize, customerId, yearMonth]);

  const rows = data?.rows ?? [];
  const totalRows = data?.total_rows ?? 0;
  const totalPages = data?.total_pages ?? 0;
  const resolvedPageSize = data?.page_size ?? pageSize;

  const startEntry = rows.length
    ? Math.min((page - 1) * resolvedPageSize + 1, totalRows)
    : 0;
  const endEntry = rows.length
    ? Math.min(startEntry + rows.length - 1, totalRows)
    : 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setCustomerId(customerIdInput.trim());
    setYearMonth(yearMonthInput.trim());
  };

  const handlePrev = () => {
    setPage((current) => Math.max(current - 1, 1));
  };

  const handleNext = () => {
    setPage((current) =>
      totalPages > 0 ? Math.min(current + 1, totalPages) : current + 1,
    );
  };

  const disablePrev = page <= 1 || isLoading;
  const disableNext = isLoading || totalPages === 0 || page >= totalPages;

  return (
    <section className="space-y-6 rounded-2xl bg-gray-800/60 p-6 shadow-xl ring-1 ring-white/10">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Monthly Features</h2>
          <p className="text-sm text-white/60">
            Tra cứu thông tin chi tiết theo khách hàng và tháng.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 md:flex-row md:items-end"
        >
          <label className="flex flex-col text-sm text-white/70">
            <span className="pb-2 font-medium">Customer ID</span>
            <input
              type="text"
              value={customerIdInput}
              onChange={(event) => setCustomerIdInput(event.target.value)}
              placeholder="VD: CUST-1001"
              className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
          </label>
          <label className="flex flex-col text-sm text-white/70">
            <span className="pb-2 font-medium">Year-Month</span>
            <input
              type="text"
              value={yearMonthInput}
              onChange={(event) => setYearMonthInput(event.target.value)}
              placeholder="YYYY-MM"
              pattern="\d{4}-\d{2}"
              className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-gray-900 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            Tìm kiếm
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gray-900/40">
        {error && (
          <div className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="px-6 py-10 text-sm text-white/60">
              Đang tải dữ liệu...
            </div>
          ) : rows.length ? (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead>
                <tr className="bg-white/5 text-xs font-semibold uppercase tracking-wider text-white/70">
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className="px-4 py-3">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row, index) => (
                  <tr
                    key={`${row.CustomerID ?? 'row'}-${row.YearMonth ?? index}`}
                    className="hover:bg-white/5"
                  >
                    {columns.map((column) => {
                      const rawValue = row?.[column.key];
                      const displayValue = column.format
                        ? column.format(rawValue)
                        : rawValue;
                      const content =
                        displayValue === null || displayValue === undefined || displayValue === ''
                          ? '--'
                          : displayValue;

                      return (
                        <td key={column.key} className="whitespace-nowrap px-4 py-3 text-sm text-white/80">
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-10 text-sm text-white/60">
              Không có dữ liệu phù hợp.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 text-sm text-white/70 md:flex-row md:items-center md:justify-between">
          <div>
            {totalRows > 0 ? (
              <span>
                Hiển thị {startEntry} - {endEntry} trên tổng {totalRows} dòng.
              </span>
            ) : (
              <span>Không có dữ liệu để hiển thị.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={disablePrev}
              className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:border-emerald-400/60 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
            >
              Prev
            </button>
            <span className="text-white/60">
              Trang {Math.max(page, 1)} / {totalPages || 1}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={disableNext}
              className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:border-emerald-400/60 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MonthlyTable;
