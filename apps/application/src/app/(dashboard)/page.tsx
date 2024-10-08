import JournalingUI from "~/components/journal";

export const runtime = "edge";


export default async function HomePage() {
  return (
    <main className="w-screen h-screen ">
      <JournalingUI />
    </main>
  );
}
