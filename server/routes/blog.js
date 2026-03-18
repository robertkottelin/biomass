const express = require('express');
const { getAllPosts, getPostBySlug, renderBlogIndex, renderBlogPost } = require('../lib/blogEngine');

const router = express.Router();

router.get('/', (req, res) => {
  const posts = getAllPosts();
  res.type('html').send(renderBlogIndex(posts));
});

router.get('/:slug', (req, res) => {
  const post = getPostBySlug(req.params.slug);
  if (!post) return res.status(404).type('html').send('<h1>Post not found</h1>');
  res.type('html').send(renderBlogPost(post));
});

module.exports = router;
