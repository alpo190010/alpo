import { db } from "@/db";
import { reports, subscribers, scans } from "@/db/schema";
import { desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [scanCount] = await db.select({ value: count() }).from(scans);
  const [subCount] = await db.select({ value: count() }).from(subscribers);
  const [reportCount] = await db.select({ value: count() }).from(reports);

  const recentScans = await db
    .select({ url: scans.url, score: scans.score, createdAt: scans.createdAt })
    .from(scans)
    .orderBy(desc(scans.createdAt))
    .limit(10);

  const recentSubs = await db
    .select({ email: subscribers.email, createdAt: subscribers.createdAt })
    .from(subscribers)
    .orderBy(desc(subscribers.createdAt))
    .limit(10);

  const stats = [
    { label: "Scans", value: scanCount.value, color: "#2563EB" },
    { label: "Subscribers", value: subCount.value, color: "#16A34A" },
    { label: "Reports Sent", value: reportCount.value, color: "#D97706" },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#F8F7F4", padding: "48px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 32 }}>
          PageScore Dashboard
        </h1>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 40 }}>
          {stats.map((s) => (
            <div key={s.label} style={{
              background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12,
              padding: "24px 20px", textAlign: "center",
            }}>
              <p style={{ fontSize: 36, fontWeight: 800, color: s.color, margin: "0 0 4px" }}>
                {s.value}
              </p>
              <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Scans */}
        <div style={{
          background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: "0 0 16px" }}>
            Recent Scans
          </h2>
          {recentScans.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>No scans yet</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>URL</th>
                  <th style={{ textAlign: "center", padding: "8px 0", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>Score</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 0", fontSize: 13, color: "#374151", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.url}
                    </td>
                    <td style={{ padding: "10px 0", fontSize: 14, fontWeight: 700, textAlign: "center",
                      color: (s.score ?? 0) >= 70 ? "#16A34A" : (s.score ?? 0) >= 40 ? "#D97706" : "#DC2626"
                    }}>
                      {s.score ?? "—"}
                    </td>
                    <td style={{ padding: "10px 0", fontSize: 12, color: "#9CA3AF", textAlign: "right" }}>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Subscribers */}
        <div style={{
          background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12,
          padding: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: "0 0 16px" }}>
            Recent Subscribers
          </h2>
          {recentSubs.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>No subscribers yet</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>Email</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentSubs.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 0", fontSize: 13, color: "#374151" }}>{s.email}</td>
                    <td style={{ padding: "10px 0", fontSize: 12, color: "#9CA3AF", textAlign: "right" }}>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
