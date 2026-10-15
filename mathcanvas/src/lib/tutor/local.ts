import { L } from "../math/lang";
import type { StepKind } from "../math/types";
import type { TutorIntent, TutorProvider, TutorRequest } from "./provider";

type Text = { en: string; vi: string };

const SIMPLER: Partial<Record<StepKind, Text>> = {
  coordinates: {
    en: "A vector just says how far to move along each axis to get from one point to the other — so it's the end point minus the start point, one coordinate at a time.",
    vi: "Vectơ chỉ cho biết phải đi bao xa theo mỗi trục để từ điểm này đến điểm kia — nên lấy điểm cuối trừ điểm đầu, từng tọa độ một.",
  },
  formula: {
    en: "This is a ready-made formula: the problem gives the numbers, we put them in the right places and simplify. Roots are kept exact (like 2√3) instead of rounded.",
    vi: "Đây là công thức có sẵn: đề bài cho các số, ta thay vào đúng chỗ rồi rút gọn. Căn được giữ chính xác (như 2√3), không làm tròn.",
  },
  construct: {
    en: "To write a line or plane you need two things: one point on it, and one direction — where a line runs, or which way a plane faces (its normal).",
    vi: "Muốn viết phương trình đường thẳng hay mặt phẳng cần hai thứ: một điểm thuộc nó và một phương — hướng đường thẳng chạy, hoặc hướng mặt phẳng quay ra (pháp tuyến).",
  },
  relation: {
    en: "Compare directions first: if they're the same, the two are parallel or identical; otherwise they cross — or, in space, two lines can also miss each other (skew).",
    vi: "So sánh phương trước: cùng phương thì song song hoặc trùng nhau; khác phương thì cắt nhau — riêng hai đường thẳng trong không gian còn có thể chéo nhau.",
  },
  "standard-form": {
    en: "Think of the equation as a balance scale. Whatever you add or take away on one side, you do on the other, so it stays balanced. We shuffle everything to one side so the other side is just 0 — it makes the next moves much easier to see.",
    vi: "Hãy coi phương trình như một cái cân. Thêm hay bớt gì ở bên này thì làm y như vậy ở bên kia, cân vẫn thăng bằng. Ta chuyển hết về một vế để vế kia bằng 0 — các bước tiếp theo sẽ dễ thấy hơn nhiều.",
  },
  scale: {
    en: "Fractions are fiddly, so we multiply everything by the same number to make them whole. Since both sides are multiplied equally, the balance doesn't change.",
    vi: "Phân số khó tính, nên ta nhân mọi thứ với cùng một số để được số nguyên. Hai vế được nhân như nhau nên cân vẫn thăng bằng.",
  },
  isolate: {
    en: "We want x alone. Something is attached to it, so we do the opposite — add if it was subtracted, subtract if it was added — on both sides.",
    vi: "Ta muốn x đứng một mình. Có số đang đi kèm với nó, nên làm phép ngược lại — đang trừ thì cộng, đang cộng thì trừ — ở cả hai vế.",
  },
  divide: {
    en: "x is being multiplied by a number. The opposite of multiplying is dividing, so we divide both sides by that number and x is left alone.",
    vi: "x đang được nhân với một số. Ngược với phép nhân là phép chia, nên chia cả hai vế cho số đó là x đứng một mình.",
  },
  discriminant: {
    en: "Δ is a quick test you can do before solving. It tells you whether to expect two answers, one, or none — so you know what you're looking for.",
    vi: "Δ là phép thử nhanh trước khi giải. Nó cho biết phương trình có hai nghiệm, một nghiệm hay vô nghiệm — để bạn biết mình đang tìm gì.",
  },
  factor: {
    en: "Factoring is un-multiplying. We rewrite the quadratic as two brackets multiplied together — like writing 6 as 2 × 3, but for expressions.",
    vi: "Phân tích thành nhân tử là “nhân ngược”. Ta viết tam thức thành tích của hai ngoặc — giống như viết 6 = 2 × 3, nhưng cho biểu thức.",
  },
  "zero-product": {
    en: "If two numbers multiply to give 0, one of them has to be 0. So either the first bracket is 0, or the second one is.",
    vi: "Nếu hai số nhân với nhau bằng 0 thì một trong hai số phải bằng 0. Vậy hoặc ngoặc thứ nhất bằng 0, hoặc ngoặc thứ hai bằng 0.",
  },
  "quadratic-formula": {
    en: "Some quadratics won't factor neatly. The quadratic formula is a recipe that always works: plug in a, b and c and out come the answers.",
    vi: "Có những tam thức không phân tích gọn được. Công thức nghiệm là “công thức nấu ăn” luôn dùng được: thay a, b, c vào là ra nghiệm.",
  },
  roots: {
    en: "Each bracket gives a tiny equation. Solve each one and you have your answers.",
    vi: "Mỗi ngoặc cho một phương trình nhỏ. Giải từng phương trình là có nghiệm.",
  },
  verify: {
    en: "Plug each answer back into the very first equation. If both sides match, it's right — this check doesn't trust any earlier step.",
    vi: "Thay từng nghiệm vào đúng phương trình ban đầu. Nếu hai vế bằng nhau thì nghiệm đúng — cách thử này không dựa vào bước nào trước đó.",
  },
  restriction: {
    en: "You can't divide by zero. So before doing anything, spot the values of x that would make a bottom (denominator) equal 0 — those are banned.",
    vi: "Không được chia cho 0. Nên trước khi làm gì, hãy tìm các giá trị x làm mẫu số bằng 0 — những giá trị đó bị cấm.",
  },
  "clear-denominators": {
    en: "Fractions are awkward, so multiply everything by something every bottom divides into. All the fractions cancel and you're left with a normal equation.",
    vi: "Phân số khó xử lý, nên nhân mọi thứ với một biểu thức chia hết cho mọi mẫu. Các phân số biến mất và còn lại một phương trình quen thuộc.",
  },
  extraneous: {
    en: "Clearing fractions can sneak in a fake answer. If an answer is one of the banned values from the start, cross it out — it doesn't really work.",
    vi: "Khử mẫu có thể sinh ra nghiệm “giả”. Nếu một nghiệm trùng với giá trị bị cấm từ đầu thì gạch bỏ — nó không thật sự là nghiệm.",
  },
  flip: {
    en: "Think of a number line: 2 is less than 3, but −2 is more than −3. Multiplying or dividing by a negative swaps the order, so the < or > has to swap too.",
    vi: "Hãy nghĩ đến trục số: 2 nhỏ hơn 3, nhưng −2 lớn hơn −3. Nhân hoặc chia cho số âm làm đảo thứ tự, nên dấu < hay > cũng phải đảo.",
  },
  "sign-chart": {
    en: "The roots chop the number line into pieces. In each piece the expression is always positive or always negative — test one number per piece to find out which.",
    vi: "Các nghiệm chia trục số thành nhiều khoảng. Trong mỗi khoảng biểu thức luôn dương hoặc luôn âm — thử một số trong mỗi khoảng để biết.",
  },
  interval: {
    en: "Interval notation is a short way to write 'all the numbers between here and there'. Round brackets mean the end isn't included, square brackets mean it is.",
    vi: "Cách viết khoảng là cách viết gọn “mọi số từ đây đến đó”. Ngoặc tròn nghĩa là không lấy đầu mút, ngoặc vuông nghĩa là có lấy.",
  },
  eliminate: {
    en: "Line two equations up and add or subtract them so one letter disappears. Then you have a smaller problem with fewer unknowns.",
    vi: "Đặt hai phương trình thẳng hàng rồi cộng hoặc trừ để một ẩn biến mất. Khi đó bài toán nhỏ hơn, ít ẩn hơn.",
  },
  swap: {
    en: "We just reorder the equations so the next one we need is on top. Nothing about the maths changes.",
    vi: "Ta chỉ đổi thứ tự các phương trình để phương trình cần dùng nằm trên. Không có gì thay đổi về mặt toán học.",
  },
  "back-substitute": {
    en: "Once you know one unknown, put its value into another equation. That equation then has fewer unknowns and is easy to finish.",
    vi: "Khi đã biết một ẩn, thế giá trị đó vào phương trình khác. Phương trình đó sẽ ít ẩn hơn và dễ giải nốt.",
  },
  "solution-point": {
    en: "These numbers make every equation true at the same time. For two unknowns, it's where the two lines cross.",
    vi: "Các số này làm mọi phương trình cùng đúng. Với hai ẩn, đó là giao điểm của hai đường thẳng.",
  },
};

const ALTERNATIVE: Partial<Record<StepKind, Text>> = {
  construct: {
    en: "Yes — you could put the given points into ax + by + cz + d = 0 and solve the system for a, b, c, d. The cross product gets the normal in one step, so it's quicker.",
    vi: "Có — bạn có thể thay các điểm đã cho vào ax + by + cz + d = 0 rồi giải hệ tìm a, b, c, d. Tích có hướng cho pháp tuyến ngay trong một bước nên nhanh hơn.",
  },
  formula: {
    en: "For a distance you could also find the foot of the perpendicular first and measure from the point to it. It's longer, but gives the same answer — a good way to check.",
    vi: "Với khoảng cách, bạn cũng có thể tìm hình chiếu trước rồi tính độ dài từ điểm đến hình chiếu. Dài hơn nhưng cùng kết quả — là một cách kiểm tra tốt.",
  },
  factor: {
    en: "Yes — you could use the quadratic formula or complete the square. They all lead to the same roots. Factoring is just fastest when the numbers are friendly.",
    vi: "Có — bạn có thể dùng công thức nghiệm hoặc đưa về bình phương đúng. Tất cả cho cùng nghiệm. Phân tích nhân tử chỉ nhanh nhất khi số đẹp.",
  },
  "quadratic-formula": {
    en: "You could complete the square instead: move c across, add (b/2a)² to both sides, and take square roots (with ±). It's the same idea the formula is built from.",
    vi: "Bạn có thể đưa về bình phương đúng: chuyển c sang vế phải, cộng (b/2a)² vào hai vế, rồi khai căn (nhớ ±). Công thức nghiệm được xây dựng từ đúng ý tưởng này.",
  },
  isolate: {
    en: "You could also move the number by 'changing its sign when it crosses the equals sign' — it's a shortcut for adding or subtracting on both sides.",
    vi: "Bạn cũng có thể dùng quy tắc chuyển vế “đổi dấu” — đó là cách viết tắt của việc cộng hoặc trừ cả hai vế.",
  },
  divide: {
    en: "You could multiply both sides by the reciprocal instead. Dividing by 2 and multiplying by ½ do the same thing.",
    vi: "Bạn có thể nhân hai vế với số nghịch đảo. Chia cho 2 và nhân với ½ là như nhau.",
  },
  verify: {
    en: "You could also graph both sides and see where they meet — use Graph to try it.",
    vi: "Bạn cũng có thể vẽ đồ thị hai vế và xem chúng cắt nhau ở đâu — thử bằng nút Đồ thị.",
  },
  "clear-denominators": {
    en: "You could also combine the fractions into a single fraction first and then set its top equal to the right-hand side times its bottom. It's the same idea in a different order.",
    vi: "Bạn cũng có thể gộp thành một phân thức trước, rồi cho tử bằng vế phải nhân mẫu. Cùng ý tưởng, chỉ khác thứ tự.",
  },
  flip: {
    en: "You could avoid dividing by a negative: move the x-term to the other side instead, so its coefficient is positive. You'll get the same answer, written the other way round.",
    vi: "Bạn có thể tránh chia cho số âm: chuyển hạng tử chứa x sang vế kia để hệ số dương. Kết quả như nhau, chỉ viết theo chiều ngược lại.",
  },
  "sign-chart": {
    en: "You could sketch the graph instead: for a positive x² term it's a U shape, below the x-axis between the roots and above it outside them.",
    vi: "Bạn có thể phác đồ thị: khi hệ số x² dương, parabol quay bề lõm lên, nằm dưới trục hoành giữa hai nghiệm và nằm trên ở ngoài khoảng hai nghiệm.",
  },
  eliminate: {
    en: "You could use substitution instead: solve one equation for a letter and put that expression into the other equation. Elimination is just tidier when the numbers line up.",
    vi: "Bạn có thể dùng phương pháp thế: rút một ẩn từ một phương trình rồi thế vào phương trình kia. Phương pháp cộng đại số chỉ gọn hơn khi hệ số đẹp.",
  },
  "back-substitute": {
    en: "You could also eliminate again to find the other unknown directly — but substituting is usually quicker.",
    vi: "Bạn cũng có thể cộng đại số lần nữa để tìm ẩn còn lại — nhưng thế vào thường nhanh hơn.",
  },
};

const SKIP: Partial<Record<StepKind, Text>> = {
  construct: {
    en: "The later parts (intersections, distances, angles) all use this equation, so without it there's nothing to work from.",
    vi: "Các ý sau (giao điểm, khoảng cách, góc) đều dùng phương trình này, nên thiếu nó thì không làm tiếp được.",
  },
  "zero-product": {
    en: "This is the step people most often rush. If you instead divided both sides by one bracket, such as (x − 2), you'd lose the solution x = 2 — and that's wrong when x = 2 makes the bracket 0, because you can't divide by 0.",
    vi: "Đây là bước hay bị làm vội nhất. Nếu bạn chia hai vế cho một ngoặc, ví dụ (x − 2), bạn sẽ mất nghiệm x = 2 — sai vì khi x = 2 ngoặc đó bằng 0, mà không được chia cho 0.",
  },
  factor: {
    en: "Without factoring (or another method such as the formula), you can't split the problem into two small ones, so you can't reach the answers.",
    vi: "Không phân tích nhân tử (hay dùng cách khác như công thức nghiệm) thì không tách được bài toán thành hai bài nhỏ, nên không tìm được nghiệm.",
  },
  discriminant: {
    en: "You can skip it if you're confident — it only predicts how many answers to expect. It's still a handy sanity check, and it tells you if factoring will work.",
    vi: "Có thể bỏ qua nếu bạn chắc chắn — nó chỉ dự đoán số nghiệm. Nhưng đây là bước kiểm tra tiện lợi, và cho biết có phân tích nhân tử được không.",
  },
  verify: {
    en: "You can, but then you can't be sure. A slip in an earlier step wouldn't show up. Checking takes seconds and catches mistakes.",
    vi: "Có thể, nhưng khi đó bạn không chắc chắn. Một lỗi nhỏ ở bước trước sẽ không lộ ra. Thử lại chỉ mất vài giây mà bắt được lỗi.",
  },
  "standard-form": {
    en: "Methods like factoring and the formula expect one side to be 0. Skip this and they won't apply.",
    vi: "Phân tích nhân tử và công thức nghiệm đều cần một vế bằng 0. Bỏ bước này thì không áp dụng được.",
  },
  isolate: {
    en: "Then x is still stuck to the number, so you can't read off the answer yet.",
    vi: "Khi đó x vẫn dính với số, nên chưa đọc được kết quả.",
  },
  divide: {
    en: "x would still be multiplied by a number, so you wouldn't have x on its own.",
    vi: "x vẫn đang nhân với một số, nên x chưa đứng một mình.",
  },
  restriction: {
    en: "This is the step that catches fake answers. Skip it and you might hand in an answer that makes the original equation divide by zero.",
    vi: "Đây là bước bắt được nghiệm giả. Bỏ qua thì bạn có thể đưa ra một nghiệm làm phương trình ban đầu chia cho 0.",
  },
  extraneous: {
    en: "You might keep an answer that breaks the original equation. It's a classic way to lose marks.",
    vi: "Bạn có thể giữ lại một nghiệm không thỏa mãn phương trình ban đầu. Đây là lỗi mất điểm kinh điển.",
  },
  flip: {
    en: "Skipping the flip gives exactly the wrong half of the number line — every answer you'd write would be wrong.",
    vi: "Quên đổi chiều sẽ cho đúng nửa sai của trục số — mọi đáp số bạn viết đều sai.",
  },
  "sign-chart": {
    en: "Without testing each region you'd be guessing whether the answer is between the roots or outside them.",
    vi: "Không thử từng khoảng thì bạn chỉ đoán tập nghiệm nằm giữa hai nghiệm hay ở ngoài.",
  },
  eliminate: {
    en: "With two unknowns in every equation, you can't pin either one down. Eliminating is what makes the system solvable.",
    vi: "Khi mọi phương trình đều có hai ẩn thì không xác định được ẩn nào. Khử ẩn chính là bước làm cho hệ giải được.",
  },
  "back-substitute": {
    en: "You'd only know some of the unknowns — a system's answer needs all of them.",
    vi: "Bạn mới biết một vài ẩn — nghiệm của hệ cần đủ tất cả các ẩn.",
  },
};

function reply(intent: TutorIntent, req: TutorRequest): string {
  const step = req.solution.steps.find((s) => s.id === req.stepId);
  if (!step) {
    return L({ en: "Select one of the solution steps first, then ask me about it.", vi: "Hãy chọn một bước trong lời giải trước, rồi hỏi mình về bước đó." });
  }
  const note =
    step.validation === "passed"
      ? ""
      : L({ en: " (Note: this step could not be fully verified.)", vi: " (Lưu ý: bước này chưa được kiểm chứng đầy đủ.)" });
  const pick = (t: Text | undefined) => (t ? L(t) : undefined);
  switch (intent) {
    case "why":
      return `${step.why}${note}`;
    case "simpler":
      return `${pick(SIMPLER[step.kind]) ?? step.explanation}${note}`;
    case "alternative":
      return (
        pick(ALTERNATIVE[step.kind]) ??
        L({
          en: "For this step there isn't really a different route — it's the standard move. A different method would change the steps before or after it.",
          vi: "Ở bước này không có cách nào khác thật sự — đây là cách làm chuẩn. Một phương pháp khác sẽ thay đổi các bước trước hoặc sau nó.",
        })
      );
    case "skip":
      return pick(SKIP[step.kind]) ?? L({ en: "Skipping it would leave a gap the next step relies on.", vi: "Bỏ qua bước này sẽ để lại lỗ hổng mà bước sau cần dùng." });
    case "free":
      return freeText(req);
  }
}

function freeText(req: TutorRequest): string {
  const q = req.question.toLowerCase();
  if (/\b(why|valid|allowed|legal|how come)\b|vì sao|tại sao|sao lại|được phép|hợp lệ/.test(q)) return reply("why", req);
  if (/\b(another|other way|different|instead|alternative)\b|cách khác|cách nào khác|phương pháp khác/.test(q)) return reply("alternative", req);
  if (/\b(skip|without|what if|mistake|wrong)\b|bỏ qua|nếu không|sai|lỗi/.test(q)) return reply("skip", req);
  if (/\b(simple|easier|confus|understand|explain|mean)\b|dễ hiểu|đơn giản|không hiểu|giải thích|nghĩa là/.test(q)) return reply("simpler", req);
  return L({
    en: "I can answer questions about why a step is valid, explain it more simply, show another way, or say what happens if you skip it. Free-form questions need the AI tutor, which isn't connected in this build — try one of the quick questions.",
    vi: "Mình trả lời được: vì sao một bước đúng, giải thích dễ hiểu hơn, cách làm khác, hoặc chuyện gì xảy ra nếu bỏ qua bước đó. Câu hỏi tự do cần gia sư AI, chưa được kết nối trong bản này — hãy thử một câu hỏi nhanh.",
  });
}

/**
 * Offline tutor: curated, template-based explanations keyed to each verified
 * step. It is deliberately not an LLM — it stands in for one behind the same
 * interface so the whole flow works without a backend.
 */
export const localTutor: TutorProvider = {
  id: "local",
  get label() {
    return L({ en: "Built-in tutor (offline)", vi: "Gia sư tích hợp (ngoại tuyến)" });
  },
  async answer(req) {
    return reply(req.intent, req);
  },
};
