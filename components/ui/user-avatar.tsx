"use client";

import { GradientAvatar } from "@outpacelabs/avatars";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type UserAvatarProps = {
    src?: string | null;
    name?: string | null;
    email?: string | null;
    alt?: string;
    size?: number;
    className?: string;
    imageClassName?: string;
};

export function getUserAvatarSeed({
    name,
    email,
}: Pick<UserAvatarProps, "name" | "email">) {
    const nameSeed = name?.trim().split(/\s+/)[0];
    if (nameSeed) return `${nameSeed} `;

    const emailSeed = email?.trim().split("@")[0]?.split(/[._-]/)[0];
    if (emailSeed) {
        return `${emailSeed.charAt(0).toUpperCase()}${emailSeed.slice(1).toLowerCase()} `;
    }

    return "Cencori ";
}

export function UserAvatar({
    src,
    name,
    email,
    alt,
    size = 32,
    className,
    imageClassName,
}: UserAvatarProps) {
    const label = name?.trim() || email?.trim() || "User";

    return (
        <Avatar
            className={cn("shrink-0 rounded-full", className)}
            style={{ width: size, height: size }}
        >
            <AvatarImage
                src={src || undefined}
                alt={alt || `${label} avatar`}
                className={cn("rounded-full object-cover", imageClassName)}
            />
            <AvatarFallback className="overflow-hidden rounded-full bg-muted p-0">
                <GradientAvatar seed={getUserAvatarSeed({ name, email })} size={size} />
            </AvatarFallback>
        </Avatar>
    );
}
