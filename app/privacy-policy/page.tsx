// app/privacy-policy/page.tsx
"use client";

import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Privacy Policy for Cencori by FohnAI</h1>
      <p className="text-zinc-400 mb-8">
        Last updated: October 25, 2025
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
        <p className="text-zinc-300 leading-relaxed">
          Welcome to Cencori, a multi-tenant AI infrastructure platform designed to help teams build, deploy, and scale AI-driven applications with consistency and reliability. Cencori is the flagship product of FohnAI, an AI R&D company. This Privacy Policy explains how Cencori by FohnAI collects, uses, discloses, and protects your information when you use our platform. By accessing or using Cencori, you agree to the terms of this Privacy Policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
        <h3 className="text-xl font-semibold mb-2">2.1. Information You Provide to Us</h3>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Account Information:</strong> When you register for an account, we collect your name, email address, password, and any other information you provide (e.g., project type, role during onboarding).</li>
          <li><strong className="text-white">Organization and Project Data:</strong> Information related to the organizations and projects you create, including names, descriptions, and configurations.</li>
          <li><strong className="text-white">Billing Information:</strong> If you subscribe to paid services, we collect billing details such as credit card information (processed by a third-party payment processor), billing address, and transaction history.</li>
          <li><strong className="text-white">Communications:</strong> Records of your interactions with our support team, feedback, or other communications.</li>
        </ul>

        <h3 className="text-xl font-semibold mt-4 mb-2">2.2. Information We Collect Automatically</h3>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Usage Data:</strong> Information about how you access and use the platform, such as IP addresses, device information, browser type, pages visited, features used, and timestamps.</li>
          <li><strong className="text-white">Cookies and Tracking Technologies:</strong> We use cookies and similar technologies to track activity on our platform and hold certain information. This helps us improve your experience and analyze platform usage.</li>
        </ul>

        <h3 className="text-xl font-semibold mt-4 mb-2">2.3. Information from Third-Party Sources</h3>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Authentication Providers:</strong> If you link your Cencori account with third-party authentication services (e.g., Google, GitHub), we receive information from those services as permitted by their privacy policies.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
        <p className="text-zinc-300 leading-relaxed mb-4">
          We use the collected information for various purposes, including to:
        </p>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li>Provide, operate, and maintain our platform and services.</li>
          <li>Manage your account, including processing registrations and authenticating users.</li>
          <li>Process transactions and manage billing for paid services.</li>
          <li>Improve, personalize, and expand our platform and services.</li>
          <li>Understand and analyze how you use our platform.</li>
          <li>Develop new products, services, features, and functionality.</li>
          <li>Communicate with you directly or through one of our partners, including for customer service, updates, and marketing.</li>
          <li>Monitor and analyze trends, usage, and activities in connection with our services.</li>
          <li>Detect and prevent fraud, security breaches, and other harmful activities.</li>
          <li>Comply with legal obligations and enforce our agreements.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. How We Share Your Information</h2>
        <p className="text-zinc-300 leading-relaxed mb-4">
          We may share your information in the following situations:
        </p>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Service Providers:</strong> We may share your information with third-party service providers to perform functions on our behalf (e.g., payment processing, hosting, analytics, customer support).</li>
          <li><strong className="text-white">Business Transfers:</strong> In connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
          <li><strong className="text-white">Affiliates:</strong> We may share your information with our affiliates, in which case we will require those affiliates to honor this Privacy Policy.</li>
          <li><strong className="text-white">Legal Obligations:</strong> We may disclose your information where required to do so by law or in response to valid requests by public authorities.</li>
          <li><strong className="text-white">With Your Consent:</strong> We may disclose your personal information for any other purpose with your consent.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
        <p className="text-zinc-300 leading-relaxed">
          We implement reasonable security measures to protect your information from unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. Your Data Rights</h2>
        <p className="text-zinc-300 leading-relaxed mb-4">
          Depending on your location, you may have the following rights regarding your personal data:
        </p>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Access:</strong> Request access to your personal data.</li>
          <li><strong className="text-white">Correction:</strong> Request correction of inaccurate personal data.</li>
          <li><strong className="text-white">Deletion:</strong> Request deletion of your personal data.</li>
          <li><strong className="text-white">Objection:</strong> Object to the processing of your personal data.</li>
          <li><strong className="text-white">Restriction:</strong> Request restriction of processing your personal data.</li>
          <li><strong className="text-white">Data Portability:</strong> Request transfer of your personal data to another party.</li>
        </ul>
        <p className="text-zinc-300 leading-relaxed mt-4">
          To exercise any of these rights, please contact us using the details below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. International Data Transfers</h2>
        <p className="text-zinc-300 leading-relaxed">
          Your information, including Personal Data, may be transferred to — and maintained on — computers located outside of your state, province, country or other governmental jurisdiction where the data protection laws may differ from those from your jurisdiction.
        </p>
        <p className="text-zinc-300 leading-relaxed mt-4">
          Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. Children&apos;s Privacy</h2>
        <p className="text-zinc-300 leading-relaxed">
          Our platform is not intended for use by children under the age of 13. We do not knowingly collect personally identifiable information from anyone under the age of 13. If you are a parent or guardian and you are aware that your child has provided us with Personal Data, please contact us. If we become aware that we have collected Personal Data from children without verification of parental consent, we take steps to remove that information from our servers.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">9. Changes to This Privacy Policy</h2>
        <p className="text-zinc-300 leading-relaxed">
          We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
        <p className="text-zinc-300 leading-relaxed">
          If you have any questions about this Privacy Policy, please contact us at:
        </p>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed mt-2">
          <li>Email: <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">support@fohnai.com</Link></li>
          <li>Website: <Link href={siteConfig.url} className="text-blue-400 hover:underline">{siteConfig.url}</Link></li>
        </ul>
      </section>
    </div>
  );
}
