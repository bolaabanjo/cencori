// app/terms-of-service/page.tsx
"use client";

import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Terms of Service for Cencori by FohnAI</h1>
      <p className="text-zinc-400 mb-8">
        Last updated: October 25, 2025
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
        <p className="text-zinc-300 leading-relaxed">
          Welcome to Cencori, a multi-tenant AI infrastructure platform provided by FohnAI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Cencori platform, including any content, functionality, and services offered on or through our platform (the &quot;Service&quot;). By accessing or using the Service, you agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you may not access or use the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. Changes to Terms</h2>
        <p className="text-zinc-300 leading-relaxed">
          We may revise and update these Terms from time to time in our sole discretion. All changes are effective immediately when we post them and apply to all access to and use of the Service thereafter. Your continued use of the Service following the posting of revised Terms means that you accept and agree to the changes. We encourage you to review these Terms periodically.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. Access and Account Security</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Account Creation:</strong> You must create an account to access certain features of the Service. You agree to provide accurate, current, and complete information during the registration process.</li>
          <li><strong className="text-white">Account Responsibility:</strong> You are responsible for maintaining the confidentiality of your account login information and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</li>
          <li><strong className="text-white">Age Restriction:</strong> You must be at least 13 years old to use the Service. By using the Service, you represent and warrant that you meet this age requirement.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. User Content and Conduct</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Your Content:</strong> You retain ownership of any data, information, or content you submit, post, or display on or through the Service (&quot;User Content&quot;). You grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, adapt, publish, and distribute your User Content solely for the purpose of operating, improving, and providing the Service.</li>
          <li><strong className="text-white">Prohibited Conduct:</strong> You agree not to use the Service for any unlawful or prohibited purpose, including but not limited to: posting harmful content, infringing intellectual property rights, distributing malware, or engaging in any activity that could damage, disable, or impair the Service.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. Intellectual Property Rights</h2>
        <p className="text-zinc-300 leading-relaxed">
          The Service and its entire contents, features, and functionality (including but not limited to all information, software, text, displays, images, video, and audio, and the design, selection, and arrangement thereof) are owned by FohnAI, its licensors, or other providers of such material and are protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
        </p>
        <p className="text-zinc-300 leading-relaxed mt-4">
          The Cencori codebase is open-source under the Apache License 2.0. This allows for community contributions and transparency. However, FohnAI reserves all commercial rights to the Cencori platform, including hosted services, enterprise features, and proprietary additions, which may be offered under separate commercial agreements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. Paid Services and Billing</h2>
        <p className="text-zinc-300 leading-relaxed mb-4">
          Certain features of the Service may require payment. You agree to pay all fees and applicable taxes associated with your use of paid services. All payments are processed by third-party payment processors, and you agree to their terms and conditions. We reserve the right to change our pricing policies at any time. All fees are non-refundable unless otherwise stated in our refund policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. Termination</h2>
        <p className="text-zinc-300 leading-relaxed">
          We may terminate or suspend your access to all or part of the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. Disclaimers</h2>
        <p className="text-zinc-300 leading-relaxed">
          The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis, without any warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free. Your use of the Service is at your sole risk.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
        <p className="text-zinc-300 leading-relaxed">
          In no event shall FohnAI, its affiliates, or their licensors, service providers, employees, agents, officers, or directors be liable for damages of any kind, under any legal theory, arising out of or in connection with your use, or inability to use, the Service, including any direct, indirect, special, incidental, consequential, or punitive damages.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">10. Governing Law</h2>
        <p className="text-zinc-300 leading-relaxed">
          These Terms shall be governed and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
        <p className="text-zinc-300 leading-relaxed">
          If you have any questions about these Terms, please contact us at:
        </p>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed mt-2">
          <li>Email: <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">support@fohnai.com</Link></li>
          <li>Website: <Link href={siteConfig.url} className="text-blue-400 hover:underline">{siteConfig.url}</Link></li>
        </ul>
      </section>
    </div>
  );
}
