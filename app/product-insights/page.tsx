import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductInsightsPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Insights: Analytics & Risk Dashboards</h1>
      <p className="text-zinc-400 mb-8">
        Short: Dashboard and analytics for monitoring trends, heatmaps, and incident triage.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s Insights feature provides comprehensive dashboards and analytics for monitoring trends, heatmaps, and facilitating incident triage. It visualizes request volume, block rates, top flagged prompts, and user-level risk, while also supporting customizable alerts and robust SLA monitoring.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Real-time dashboards, charting, and anomaly detection:</strong> Gain immediate visibility into your AI operations with dynamic visualizations and automatic detection of unusual activities.</li>
          <li><strong className="text-white">Rule tuning UI, alerting (webhooks, email, Slack, PagerDuty):</strong> Refine security rules with an intuitive interface and get instant notifications through your preferred communication channels.</li>
          <li><strong className="text-white">Audit & incident timelines for investigations:</strong> Streamline security investigations with detailed timelines of audit events and incidents.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Insights is tailored for security teams, product owners, and SOC analysts who need to monitor, analyze, and respond to security events within their AI infrastructure.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Web dashboard + APIs:</strong> Access powerful analytics through a user-friendly web interface or integrate data directly into your existing systems via comprehensive APIs.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Monitor and analyze your AI security posture.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Insights</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
