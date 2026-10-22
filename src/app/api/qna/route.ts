import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { getMongoCollections, QnAAnswer, QnADocument } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const body = await req.json();
    const { action } = body;

    const { qna } = await getMongoCollections();

    if (action === "answer") {
      const { question_id, answer_text } = body;
      if (!question_id || !answer_text?.trim()) {
        return NextResponse.json(
          { error: "question_id and answer_text are required" },
          { status: 400 }
        );
      }

      const responderRole = user?.role || "customer";
      const responderName =
        responderRole === "seller" && user?.store_name
          ? `${user.store_name} (Official Seller)`
          : user?.name || "Aarav Sharma";

      const newAnswer: QnAAnswer = {
        answer_id: `ANS-${Date.now().toString().slice(-5)}`,
        responder_id: user?.user_id || 4,
        responder_name: responderName,
        responder_role: responderRole,
        answer_text: answer_text.trim(),
        is_seller_response: responderRole === "seller" || responderRole === "admin",
        helpful_count: 1,
        answered_at: new Date().toISOString(),
      };

      await qna.updateOne(
        { question_id },
        { $push: { answers: newAnswer } }
      );

      return NextResponse.json({
        message:
          "Nested answer pushed to `answers[]` array in MongoDB `qna` collection ($push operator)",
        answer: newAnswer,
      });
    }

    // Default: Ask a new Question
    const { product_id, question } = body;
    if (!product_id || !question?.trim()) {
      return NextResponse.json(
        { error: "product_id and question are required" },
        { status: 400 }
      );
    }

    const newQna: QnADocument = {
      question_id: `QNA-${Date.now().toString().slice(-5)}`,
      product_id: Number(product_id),
      customer_id: user?.user_id || 4,
      customer_name: user?.name || "Aarav Sharma",
      question: question.trim(),
      answers: [],
      created_at: new Date().toISOString(),
    };

    await qna.insertOne(newQna);

    return NextResponse.json(
      {
        message: "Question created in MongoDB `qna` collection",
        qna: newQna,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process Q&A" },
      { status: 500 }
    );
  }
}
