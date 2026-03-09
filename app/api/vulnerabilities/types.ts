import { Vulnerability, User, Comment } from "@prisma/client";

export type VulnerabilityWithCollaboration = Vulnerability & {
    askForHelp: boolean;
    collaborators: { id: string; name?: string }[];
};

export type UserWithRoles = User & {
    roles: string[];
};

export type CommentWithAuthor = Comment & {
    author: {
        name: string | null;
        email: string | null;
    };
};
