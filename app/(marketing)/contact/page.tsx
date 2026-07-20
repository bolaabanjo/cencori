"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Building2, Loader2, CheckCircle } from "lucide-react";
import { toast } from "@/components/ui/toast";

const contactTypes = [
    { value: 'general', label: 'General Inquiry', email: 'hello@cencori.com' },
    { value: 'support', label: 'Technical Support', email: 'support@cencori.com' },
    { value: 'enterprise', label: 'Enterprise Sales', email: 'enterprise@cencori.com' },
];

export default function ContactPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company: '',
        type: 'general',
        subject: '',
        message: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            setIsSubmitted(true);
            toast.success('Message sent! We\'ll get back to you soon.');
            setFormData({ name: '', email: '', company: '', type: 'general', subject: '', message: '' });
        } catch (error) {
            toast.error('Failed to send message. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    return (
        <div className="container mx-auto py-16 px-4 max-w-4xl">
            {/* Header */}
            <div className="text-center mb-16">
                <h1 className="text-4xl font-bold tracking-tight mb-4">Get in Touch</h1>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                    Have questions about Cencori? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
                </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
                {/* Contact cards */}
                <div className="p-6 border rounded-lg text-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">Email Us</h3>
                    <p className="text-muted-foreground text-sm mb-3">For general inquiries</p>
                    <a href="mailto:hello@cencori.com" className="text-primary hover:underline text-sm">
                        hello@cencori.com
                    </a>
                </div>

                <div className="p-6 border rounded-lg text-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">Support</h3>
                    <p className="text-muted-foreground text-sm mb-3">Technical help & issues</p>
                    <a href="mailto:support@cencori.com" className="text-primary hover:underline text-sm">
                        support@cencori.com
                    </a>
                </div>

                <div className="p-6 border rounded-lg text-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">Enterprise</h3>
                    <p className="text-muted-foreground text-sm mb-3">Custom plans & SLAs</p>
                    <a href="mailto:enterprise@cencori.com" className="text-primary hover:underline text-sm">
                        enterprise@cencori.com
                    </a>
                </div>
            </div>

            {/* Contact Form */}
            <div className="border rounded-lg p-8">
                <h2 className="text-2xl font-semibold mb-6">Send us a message</h2>

                {isSubmitted ? (
                    <div className="text-center py-12">
                        <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">Message Sent!</h3>
                        <p className="text-muted-foreground mb-6">
                            Thanks for reaching out. We&apos;ll get back to you within 24 hours.
                        </p>
                        <Button variant="outline" onClick={() => setIsSubmitted(false)}>
                            Send Another Message
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    placeholder="Your name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@company.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="company">Company (optional)</Label>
                                <Input
                                    id="company"
                                    placeholder="Your company"
                                    value={formData.company}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Inquiry Type</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {contactTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                                id="subject"
                                placeholder="How can we help?"
                                value={formData.subject}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="message">Message</Label>
                            <Textarea
                                id="message"
                                placeholder="Tell us more about your needs..."
                                rows={5}
                                value={formData.message}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                'Send Message'
                            )}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
