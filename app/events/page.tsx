import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function EventsPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Events: Webinars, Talks & Meetups</h1>
      <p className="text-zinc-400 mb-8">
        Upcoming webinars, talks, meetups, and recordings of past events.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Join Us</h2>
        <p className="text-zinc-300 leading-relaxed">
          Check our events page regularly for upcoming opportunities to connect with the Cencori team and community.
        </p>
      </section>
    </div>
  );
}
