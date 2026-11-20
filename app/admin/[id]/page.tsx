import PostEditorPage from "../PostEditorPage";

export default function EditArticlePage({ params }: { params: { id: string } }) {
  return <PostEditorPage key={params.id} postId={params.id} />;
}
