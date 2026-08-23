"""
Advice Engine for Diet Recommendation.
Provides human-readable suggestions when optimization fails or produces marginal results.
This module is designed to be easily decoupled or disabled.
"""

from typing import List, Dict, Any

# Mapping of constraint internal names to user-friendly advice
# CONSTRAINT_ADVICE = {
#     "energy_req": "The energy requirement is not being met. Try adding energy-dense feeds like cereal grains (Maize/Corn), Rice Bran, or Molasses.",
#     "mp_req": "The protein requirement is too low. Consider adding protein-rich supplements like Soybean Meal, Cottonseed Cake, or Green Legumes.",
#     "nel_balance_max": "The diet is significantly short on energy. Try adding more grains or high-energy concentrates.",
#     "mp_balance_max": "The metabolizable protein balance is negative. Consider increasing protein-rich feed sources.",
#     "ca": "Calcium levels are below the target. Consider adding a mineral supplement or calcium-rich feeds.",
#     "p": "Phosphorus levels are insufficient. Consider adding a mineral mix or rice bran.",
#     "ndf_for_min": "Forage fiber (NDF) is too low. This is critical for rumen health. Try adding more dry fodder (Straw/Stover) or high-quality grasses.",
#     "ndf_max": "Total fiber is too high, which may limit intake. Try reducing the proportion of low-quality straw and adding more concentrates or fresh forage.",
#     "starch_max": "Starch content is too high, which increases the risk of acidosis. Try reducing cereal grains and increasing fiber-rich forages.",
#     "ee_max": "Fat (EE) content is too high. High fat levels can interfere with digestion. Reduce oil-rich seeds or supplements.",
#     "ash_max": "Ash content is high, which often indicates soil contamination or low-quality ingredients. Check the quality of your forages.",
#     "conc_max": "The proportion of concentrates is too high. This can be expensive and unhealthy. Try increasing forages to balance the diet.",
#     "forage_fibrous_max": "Low-quality fibrous forages are too high. Consider improving the forage quality with more legumes or silage.",
# }

CONSTRAINT_ADVICE = {
    "energy_req": "To further boost the energy levels of this diet, consider adding energy-dense feeds like cereal grains (Maize/Corn), Rice Bran, or Molasses.",
    "mp_req": "A small addition of protein-rich feeds would help reach the optimal target for your cattle. Consider supplements like Soybean Meal or Green Legumes.",
    "nel_balance_max": "This diet would benefit from additional energy sources. Try including more grains or high-energy concentrates to meet the ideal target.",
    "mp_balance_max": "To reach the ideal protein balance, consider increasing protein-rich feed sources in your selection.",
    "ca": "Calcium levels are slightly below the ideal target. Consider adding a mineral supplement or calcium-rich feeds to reach the goal.",
    "p": "Phosphorus levels could be improved to reach the target. Consider adding a mineral mix or rice bran.",
    "ndf_for_min": "Adding a bit more dry fodder (Straw/Stover) or high-quality grasses would support better rumen health and fiber balance.",
    "ndf_max": "The total fiber is slightly high. For better intake, you might consider replacing some low-quality straw with concentrates or fresh forage.",
    "starch_max": "Starch content is a bit high. To maintain a healthy rumen, try slightly reducing cereal grains and increasing fiber-rich forages.",
    "ee_max": "The fat (EE) content is higher than the recommended limit. Reducing oil-rich seeds or supplements will help maintain optimal digestion.",
    "ash_max": "Ash content is a bit high. Checking the quality and cleanliness of your forages can help reduce this to ideal levels.",
    "conc_max": "To maintain a cost-effective and healthy balance, you might consider slightly increasing the forage proportion relative to concentrates.",
    "forage_fibrous_max": "Consider improving the forage quality by adding more legumes or silage to reach a more optimal balance.",
    "other_wet_ingr_max": "Very wet ingredients make up more of the diet than ideal. Replacing part of them with a drier alternative will help dry matter intake and keep the ration stable.",
    "tree_legume_max": "Tree and shrub forages are important for a balanced diet. Consider increasing their proportion to improve nutritional quality.",
}

def get_recommendations(worst_constraints: List[Dict[str, Any]], feed_data: List[Dict[str, Any]]) -> List[str]:
    """
    Generate actionable recommendations based on the worst-performing constraints.
    """
    recommendations = []
    
    # 1. Constraint-based advice
    seen_advice = set()
    for constraint in worst_constraints:
        name = constraint.get("name")
        advice = CONSTRAINT_ADVICE.get(name)
        if advice and advice not in seen_advice:
            recommendations.append(advice)
            seen_advice.add(advice)
            
    # 2. General logic-based advice (Feed Balance)
    if not recommendations:
        # Fallback for generic failures
        # recommendations.append("Unable to find a perfect balance with the current selection. Try adding more diverse feed options, specifically high-quality green fodder and energy supplements.")
        recommendations.append("To reach a more optimal balance, try adding more diverse feed options such as high-quality green fodder or energy supplements.")

    # 3. Categorical check (Optional improvement)
    # Check if there's a complete lack of certain categories in selected feeds
    categories = {f.get('fd_category', '').lower() for f in feed_data}
    if 'forage' not in str(categories) and 'grass' not in str(categories) and 'legume' not in str(categories):
        # recommendations.append("Warning: Your selection appears to be missing basic forages. Adding grass or straw is usually required for a healthy diet.")
        recommendations.append("Consider adding basic forages such as grass or straw to support a more balanced and healthy diet.")

    return recommendations
