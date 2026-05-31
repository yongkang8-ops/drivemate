const rows = [
  ["DM-GWM-OF-001", "GWM", "Genuine Engine Oil Filter", "Service Filter", "Brisbane stock"],
  ["DM-GWM-AF-002", "GWM", "Genuine Air Filter", "Service Filter", "Brisbane stock"],
  ["DM-GWM-CF-003", "GWM", "Genuine Cabin Filter", "Service Filter", "Brisbane stock"],
  ["DM-BYD-CF-007", "BYD", "Cabin Filter", "Service Filter", "Brisbane stock"],
];

export default function CataloguePage() {
  return (
    <main className="page-main">
      <p className="eyebrow">Catalogue</p>
      <h1>Search AU-fitment parts by vehicle and stock</h1>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="form-grid">
          <label>
            Keyword
            <input defaultValue="filter" />
          </label>
          <label>
            Brand
            <select defaultValue="all">
              <option value="all">All brands</option>
              <option>GWM</option>
              <option>BYD</option>
              <option>MG</option>
            </select>
          </label>
        </div>
      </section>
      <section className="table-shell" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Brand</th>
              <th>Part</th>
              <th>Category</th>
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
