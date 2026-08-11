import { User } from "./models/user";
import { Post } from "./models/post";
import type { UserService } from "./application/user-service";
import type { PostService } from "./application/post-service";

export async function seedData(
	userService: UserService,
	postService: PostService,
) {
	console.log("Seeding 50 users...");
	const users = [];
	for (let i = 1; i <= 50; i++) {
		const role = i % 3 === 0 ? "admin" : i % 3 === 1 ? "member" : "viewer";
		const age = 20 + (i % 80); // 20 to 99
		const user = await userService.createUser({
			name: `User ${i}`,
			email: `user${i}@example.com`,
			role: role as any,
			age,
		});
		users.push(user);
	}

	console.log("Seeding 1000 posts...");
	for (let i = 1; i <= 1000; i++) {
		const author = users[i % 50]!;
		const created_at = new Date(Date.now() - i * 60 * 1000).toISOString();
		await postService.create({
			id: crypto.randomUUID(),
			title: `Post Title ${i}`,
			body: `This is the body of post number ${i}. It has some interesting content in it.`,
			author: {
				id: author.id,
				name: author.name,
				email: author.email,
				role: author.role,
				age: author.age,
				created_at: author.created_at,
			},
			authorId: author.id,
			published: i % 2 === 0,
			created_at,
		} as any);
	}
	console.log("Seeding completed successfully!");
}
