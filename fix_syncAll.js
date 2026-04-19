export async function syncAll() {
  console.log("🔥 SYNC START");

  try {
    await processSyncQueue();
    await pullRemoteChanges();

    console.log("🔥 SYNC DONE");
    notifyDataChanged('all');

  } catch (e) {
    console.log("🔥 SYNC ERROR:", e);
  }
}
