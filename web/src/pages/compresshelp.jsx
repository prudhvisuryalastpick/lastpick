// "How to make a video smaller": shown from the rental video upload (videos must be up to 1 minute and 20 MB).
export function CompressHelp() {
  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 14, lineHeight: 1.55 }}>
      <h1 className="title" style={{ margin: 0 }}>Make your video smaller</h1>
      <p className="muted" style={{ margin: 0 }}>Listing videos can be up to 1 minute and 20 MB. Photos are made smaller automatically; you don't need to do anything for them.</p>
      <div className="card">
        <b>1. Record in 720p (easiest)</b>
        <p style={{ margin: "6px 0 0" }}>Open your phone's Camera, go to Video, then Settings (the gear icon), and set the video size or resolution to <b>720p (HD)</b>. A 1-minute 720p video is usually 15–20 MB, with no extra app.</p>
      </div>
      <div className="card">
        <b>2. Keep it short</b>
        <p style={{ margin: "6px 0 0" }}>A 30–45 second walk-through (entrance, rooms, kitchen, bathroom, view) is enough. Your phone's Gallery can trim a video: open it, tap Edit, and drag the ends.</p>
      </div>
      <div className="card">
        <b>3. Use a free compressor app</b>
        <p style={{ margin: "6px 0 0" }}><b>Compressor</b> is a free, open-source Android app with no ads and no sign-up. It makes a video smaller on your phone, without uploading it anywhere.</p>
        <a className="btn ghost sm" style={{ marginTop: 8 }} href="https://github.com/JoshAtticus/Compressor/releases" target="_blank" rel="noopener noreferrer">Get Compressor (GitHub)</a>
        <p className="muted small" style={{ margin: "8px 0 0" }}>It isn't on the Play Store: download the APK from its GitHub page, or get it from the IzzyOnDroid F-Droid repository. Android may ask you to allow installing it.</p>
      </div>
      <a className="btn main" href="#/owner/rentals">Back to my listings</a>
    </div>
  );
}
