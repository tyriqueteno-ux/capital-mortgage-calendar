// Static page structure. public/app.js fills it in and wires it up.
export default function Shell({ company }) {
  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="brand"><h1>{company} Calendar</h1><span className="tz" id="tz"></span></div>
          <div className="nav">
            <button className="btn icon" id="prev" aria-label="Previous">&#8249;</button>
            <button className="btn" id="todayBtn">Today</button>
            <button className="btn icon" id="next" aria-label="Next">&#8250;</button>
            <h2 id="rangeLabel"></h2>
          </div>
          <div className="seg" role="group" aria-label="View" id="viewSeg">
            <button data-v="month">Month</button><button data-v="week">Week</button><button data-v="day">Day</button><button data-v="agenda">Agenda</button>
          </div>
          <button className="btn primary" id="newEvent">+ New appointment</button>
        </div>

        <div className="shell">
          <div className="main">
            <div id="banner"></div>
            <div id="view" className="panel"></div>
            <div className="sync" id="sync"></div>
          </div>
          <aside className="side">
            <div className="panel sec todaycard" id="todayCard"></div>
            <div className="panel sec" id="remPanel">
              <h3>Reminders</h3>
              <form className="radd" id="remForm" autoComplete="off">
                <input className="field title" id="remTitle" placeholder="Add a reminder, like “Order appraisal for Ramirez file”" maxLength={300} />
                <div className="row" style={{ alignItems: "center" }}>
                  <input className="field" type="date" id="remDate" aria-label="Due date" />
                  <button className="btn primary" type="submit" id="remAdd" style={{ flex: "none" }}>Add</button>
                </div>
              </form>
              <div id="remList"><p className="empty">Loading reminders…</p></div>
              <p className="fine" style={{ marginTop: 10 }}>Saved to Google Tasks, so they also show in the Google Tasks app and Google Calendar.</p>
            </div>
            <div className="panel sec" id="bookPanel">
              <h3>Client booking</h3>
              <div id="bookBody"><p className="empty">Loading…</p></div>
            </div>
            <div className="panel sec">
              <h3>Calendars <button className="btn ghost" id="refresh" style={{ marginLeft: "auto", padding: "3px 8px", fontSize: 12 }}>Refresh</button></h3>
              <div className="cals" id="cals"><p className="empty">Connecting to Google Calendar…</p></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                <button className="btn" id="appleBtn">Add Apple Calendar</button>
              </div>
            </div>
            <div className="who-am-i" id="whoami"></div>
          </aside>
        </div>
      </div>
      <div id="modalRoot"></div>
      <div id="toastRoot"></div>
    </>
  );
}
